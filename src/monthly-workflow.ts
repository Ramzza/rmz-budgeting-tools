import { readFile } from "node:fs/promises";
import { analyzeMonthlySheet, type MonthlySheetLayout, type MonthlySheetTable } from "./google-sheets/sheet-layout.js";
import { createSheetsClient, getValues, updateBatchValues, type ValueUpdate, type Values } from "./google-sheets/sheets.js";
import { parseCategoryBreakdownHtml, type CategorySpend } from "./revolut-spending/spending-html.js";
import { fetchLatestExchangeRates, type ExchangeRate } from "./market-data/bnr.js";
import { parseDate } from "./market-data/dates.js";
import { fetchLatestStockPriceData, type PriceQuote } from "./market-data/prices.js";
import { validateYearMonth } from "./google-sheets/spendings.js";

export interface MonthlyWorkflowOptions {
  yearMonth: string;
  spreadsheetId: string;
  spendingFile?: string;
}

export interface MonthlyPrice {
  currency: string;
  quote: PriceQuote;
}

export interface MonthlyWorkflowDependencies {
  readSheet: (spreadsheetId: string, range: string) => Promise<Values>;
  readSpendingHtml: (path: string) => Promise<string>;
  fetchPrice: (symbol: string, endDate: string) => Promise<MonthlyPrice>;
  fetchExchangeRates: (currencies: string[], endDate: string) => Promise<ExchangeRate[]>;
  writeUpdates: (spreadsheetId: string, updates: ValueUpdate[]) => Promise<unknown>;
}

export interface MonthlyWorkflowResult {
  yearMonth: string;
  asOfDate: string;
  updatedCells: number;
}

function monthEndDate(yearMonth: string): string {
  const [year, month] = validateYearMonth(yearMonth).split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

function columnName(columnIndex: number): string {
  let remainder = columnIndex + 1;
  let name = "";
  while (remainder > 0) {
    remainder -= 1;
    name = `${String.fromCharCode(65 + (remainder % 26))}${name}`;
    remainder = Math.floor(remainder / 26);
  }
  return name;
}

function sheetCellRange(yearMonth: string, row: number, column: number): string {
  const quotedSheet = yearMonth.replaceAll("'", "''");
  return `'${quotedSheet}'!${columnName(column)}${row}`;
}

function spendingUpdates(
  yearMonth: string,
  table: MonthlySheetTable,
  spendings: readonly CategorySpend[],
): ValueUpdate[] {
  const totals = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const spending of spendings) {
    const category = spending.category.trim();
    if (!category || !Number.isFinite(spending.ron) || spending.ron < 0) {
      throw new Error("spending entries must have a non-empty category and non-negative amount");
    }
    const key = normalizeKey(category);
    const total = (totals.get(key) ?? 0) + spending.ron;
    if (!Number.isFinite(total)) {
      throw new Error(`spending total for category ${category} is not finite`);
    }
    totals.set(key, total);
    labels.set(key, category);
  }

  const matched = new Set<string>();
  const updates = table.rows.map(({ key, row }) => {
    const normalized = normalizeKey(key);
    const amount = totals.get(normalized) ?? 0;
    if (totals.has(normalized)) matched.add(normalized);
    return {
      range: sheetCellRange(yearMonth, row, table.outputColumns[0]!),
      values: [[amount]],
    };
  });
  const unmatched = [...totals.keys()].filter((category) => !matched.has(category));
  if (unmatched.length > 0) {
    const categories = unmatched.map((category) => labels.get(category) ?? category);
    throw new Error(`spending categories not found in sheet categories: ${categories.join(", ")}`);
  }
  return updates;
}

function requireDateOnOrBefore(value: string, endDate: string, label: string): void {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(Number.NaN);
  const isValid = !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  if (!isValid || value > endDate) {
    throw new Error(`${label} must be a valid date on or before ${endDate}`);
  }
}

function marketDataUpdates(
  yearMonth: string,
  endDate: string,
  layout: MonthlySheetLayout,
  prices: readonly MonthlyPrice[],
  rates: readonly ExchangeRate[],
): ValueUpdate[] {
  const priceBySymbol = new Map<string, MonthlyPrice>();
  for (const price of prices) {
    priceBySymbol.set(normalizeKey(price.quote.symbol), price);
  }
  const rateByCurrency = new Map<string, ExchangeRate>();
  for (const rate of rates) {
    rateByCurrency.set(normalizeKey(rate.currency), rate);
  }

  const updates: ValueUpdate[] = [];
  for (const item of layout.prices.rows) {
    const price = priceBySymbol.get(normalizeKey(item.key));
    if (!price) {
      throw new Error(`no share price was returned for ${item.key}`);
    }
    if (!price.currency.trim() || price.quote.close === null || !Number.isFinite(price.quote.close)) {
      throw new Error(`no finite share price was returned for ${item.key}`);
    }
    requireDateOnOrBefore(price.quote.date, endDate, `share price date for ${item.key}`);
    const values = [price.quote.close, price.currency.trim().toUpperCase(), price.quote.date];
    layout.prices.outputColumns.forEach((column, index) => {
      updates.push({
        range: sheetCellRange(yearMonth, item.row, column),
        values: [[values[index] as string | number]],
      });
    });
  }

  for (const item of layout.exchangeRates.rows) {
    const rate = rateByCurrency.get(normalizeKey(item.key));
    if (!rate) {
      throw new Error(`no RON exchange rate was returned for ${item.key}`);
    }
    if (!Number.isFinite(rate.ronPerUnit) || rate.ronPerUnit <= 0) {
      throw new Error(`exchange rate for ${item.key} must be a positive finite number`);
    }
    requireDateOnOrBefore(rate.date, endDate, `exchange-rate date for ${item.key}`);
    const values = [rate.ronPerUnit, rate.date];
    layout.exchangeRates.outputColumns.forEach((column, index) => {
      updates.push({
        range: sheetCellRange(yearMonth, item.row, column),
        values: [[values[index] as string | number]],
      });
    });
  }
  return updates;
}

export function buildMonthlyUpdates(
  yearMonth: string,
  layout: MonthlySheetLayout,
  spendings: readonly CategorySpend[],
  prices: readonly MonthlyPrice[],
  rates: readonly ExchangeRate[],
): ValueUpdate[] {
  const month = validateYearMonth(yearMonth);
  const updates = spendingUpdates(month, layout.spending, spendings);
  updates.push(...marketDataUpdates(month, monthEndDate(month), layout, prices, rates));
  return updates;
}

async function createDefaultDependencies(): Promise<MonthlyWorkflowDependencies> {
  const sheets = await createSheetsClient();
  return {
    readSheet: (spreadsheetId, range) => getValues(sheets, spreadsheetId, range),
    readSpendingHtml: (path) => readFile(path, "utf8"),
    fetchPrice: async (symbol, endDate) => {
      const data = await fetchLatestStockPriceData(symbol, parseDate(endDate));
      if (!data.quote) {
        throw new Error(`no closing price was found for ${symbol} on or before ${endDate}`);
      }
      return { currency: data.currency, quote: data.quote };
    },
    fetchExchangeRates: (currencies, endDate) =>
      fetchLatestExchangeRates(parseDate(endDate), currencies),
    writeUpdates: async (spreadsheetId, updates) => {
      await updateBatchValues(sheets, spreadsheetId, updates);
    },
  };
}

export async function runMonthlyWorkflow(
  options: MonthlyWorkflowOptions,
  dependencies?: MonthlyWorkflowDependencies,
): Promise<MonthlyWorkflowResult> {
  const yearMonth = validateYearMonth(options.yearMonth);
  const spreadsheetId = options.spreadsheetId.trim();
  if (!spreadsheetId) throw new Error("Spreadsheet ID is required.");
  const endDate = monthEndDate(yearMonth);
  const activeDependencies = dependencies ?? await createDefaultDependencies();
  const range = `'${yearMonth}'!A:ZZ`;
  const sheetValues = await activeDependencies.readSheet(spreadsheetId, range);
  const layout = analyzeMonthlySheet(sheetValues);
  const spendingFile = options.spendingFile ?? `output/spending-${yearMonth}.html`;
  const spendings = parseCategoryBreakdownHtml(
    await activeDependencies.readSpendingHtml(spendingFile),
  );
  const expenseUpdates = spendingUpdates(yearMonth, layout.spending, spendings);

  const prices = await Promise.all(
    layout.prices.rows.map(({ key }) => activeDependencies.fetchPrice(key, endDate)),
  );
  const currencies = layout.exchangeRates.rows.map(({ key }) => key);
  const rates = currencies.length > 0
    ? await activeDependencies.fetchExchangeRates(currencies, endDate)
    : [];
  const updates = [
    ...expenseUpdates,
    ...marketDataUpdates(yearMonth, endDate, layout, prices, rates),
  ];
  if (updates.length > 0) {
    await activeDependencies.writeUpdates(spreadsheetId, updates);
  }
  return { yearMonth, asOfDate: endDate, updatedCells: updates.length };
}
