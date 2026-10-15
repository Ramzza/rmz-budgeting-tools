import assert from "node:assert/strict";
import test from "node:test";

const workflowModule = await import("../src/monthly-workflow.js").catch(() => undefined);
const layoutModule = await import("../src/google-sheets/sheet-layout.js").catch(() => undefined);

const sheetValues = Array.from({ length: 44 }, () => [] as (string | number | boolean | null)[]);
sheetValues[0] = ["Ticker", "Share Price", "Price Currency", "Price Date"];
sheetValues[1] = ["AAPL", null, null, null];
sheetValues[3] = ["Currency", "RON per Unit", "Rate Date"];
sheetValues[4] = ["EUR", null, null];
sheetValues[41] = ["Kategória", null, "RON (N)", "RON (ZS)"];
sheetValues[42] = ["Groceries", null, null, null];
sheetValues[43] = ["Transport", null, null, null];

const positionalSheetValues = Array.from(
  { length: 70 },
  () => [] as (string | number | boolean | null)[],
);
positionalSheetValues[15] = [null, "EUR", null, null, null, "DE.EUNL", null];
positionalSheetValues[16] = [null, "USD", null, null, null, "TVBETETF", null];
positionalSheetValues[17] = [null, "HUF", null, null, null, "DE.SXR8", null];
positionalSheetValues[18] = [null, null, null, null, null, "AAPL", null];
positionalSheetValues[41] = ["Kategória", null, "RON (N)", "RON (ZS)"];
positionalSheetValues[42] = ["Groceries", null, null, null];
positionalSheetValues[43] = ["Transport", null, null, null];

test("APP-002: fills the RON (ZS) profile and batches discovered spending, price, and rate cells", async () => {
  assert.ok(workflowModule, "the monthly workflow module must be available");
  const writes: Array<{ range: string; values: unknown[][] }> = [];
  const requestedPrices: string[] = [];
  const requestedCurrencies: string[][] = [];

  const result = await workflowModule.runMonthlyWorkflow(
    {
      yearMonth: "2026-09",
      spreadsheetId: "spreadsheet-for-2026",
      spendingFile: "spending.html",
    },
    {
      readSheet: async (spreadsheetId: string, range: string) => {
        assert.equal(spreadsheetId, "spreadsheet-for-2026");
        assert.equal(range, "'09'!A:ZZ");
        return sheetValues;
      },
      readSpendingHtml: async (path: string) => {
        assert.equal(path, "spending.html");
        return '<button data-event-key="action.analytics.transaction-breakdown.click">Groceries 2 transactions - RON 75</button>';
      },
      fetchPrice: async (symbol: string, endDate: string) => {
        requestedPrices.push(`${symbol}:${endDate}`);
        return {
          quote: { date: "2026-09-30", symbol, close: 191.5 },
        };
      },
      fetchExchangeRates: async (currencies: string[], endDate: string) => {
        requestedCurrencies.push(currencies);
        assert.equal(endDate, "2026-09-30");
        return [{ date: "2026-09-30", currency: "EUR", ronPerUnit: 5.08 }];
      },
      writeUpdates: async (_spreadsheetId: string, updates: Array<{ range: string; values: unknown[][] }>) => {
        writes.push(...updates);
      },
    },
  );

  assert.deepEqual(requestedPrices, ["AAPL:2026-09-30"]);
  assert.deepEqual(requestedCurrencies, [["EUR", "USD"]]);
  assert.deepEqual(writes, [
    { range: "'09'!D43", values: [[75]] },
    { range: "'09'!D44", values: [[0]] },
    { range: "'09'!B2", values: [[191.5]] },
    { range: "'09'!C2", values: [["USD"]] },
    { range: "'09'!D2", values: [["2026-09-30"]] },
    { range: "'09'!B5", values: [[5.08]] },
    { range: "'09'!C5", values: [["2026-09-30"]] },
  ]);
  assert.deepEqual(result, {
    yearMonth: "2026-09",
    asOfDate: "2026-09-30",
    updatedCells: 7,
  });
});

test("APP-002: reads positional market cells and applies the configured ticker currencies", async () => {
  assert.ok(workflowModule, "the monthly workflow module must be available");
  const writes: Array<{ range: string; values: unknown[][] }> = [];
  const requestedPrices: string[] = [];
  const requestedCurrencies: string[][] = [];
  const tickerPrices: Record<string, number> = {
    "DE.EUNL": 100.1,
    TVBETETF: 200.2,
    "DE.SXR8": 300.3,
    AAPL: 400.4,
  };

  const result = await workflowModule.runMonthlyWorkflow(
    {
      yearMonth: "2026-09",
      spreadsheetId: "spreadsheet-for-2026",
      spendingFile: "spending.html",
    },
    {
      readSheet: async () => positionalSheetValues,
      readSpendingHtml: async () =>
        '<button data-event-key="action.analytics.transaction-breakdown.click">Groceries 2 transactions - RON 75</button>',
      fetchPrice: async (symbol: string, endDate: string) => {
        requestedPrices.push(`${symbol}:${endDate}`);
        const price = tickerPrices[symbol];
        assert.ok(price, `unexpected ticker ${symbol}`);
        return {
          quote: { date: endDate, symbol, close: price },
        };
      },
      fetchExchangeRates: async (currencies: string[], endDate: string) => {
        requestedCurrencies.push(currencies);
        return currencies.map((currency) => ({
          date: endDate,
          currency,
          ronPerUnit: currency === "EUR" ? 5.08 : currency === "USD" ? 4.5 : currency === "HUF" ? 0.013 : 1,
        }));
      },
      writeUpdates: async (_spreadsheetId: string, updates: Array<{ range: string; values: unknown[][] }>) => {
        writes.push(...updates);
      },
    },
  );

  assert.deepEqual(requestedPrices, [
    "DE.EUNL:2026-09-30",
    "TVBETETF:2026-09-30",
    "DE.SXR8:2026-09-30",
    "AAPL:2026-09-30",
  ]);
  assert.deepEqual(requestedCurrencies, [["EUR", "USD", "HUF", "RON"]]);
  assert.deepEqual(writes, [
    { range: "'09'!D43", values: [[75]] },
    { range: "'09'!D44", values: [[0]] },
    { range: "'09'!G16", values: [[100.1]] },
    { range: "'09'!G17", values: [[200.2]] },
    { range: "'09'!G18", values: [[300.3]] },
    { range: "'09'!G19", values: [[400.4]] },
    { range: "'09'!C16", values: [[5.08]] },
    { range: "'09'!C17", values: [[4.5]] },
    { range: "'09'!C18", values: [[0.013]] },
  ]);
  assert.deepEqual(result, {
    yearMonth: "2026-09",
    asOfDate: "2026-09-30",
    updatedCells: 9,
  });
});

test("APP-002: does not write partial updates when spending does not match the sheet", async () => {
  assert.ok(workflowModule, "the monthly workflow module must be available");
  let writeCount = 0;

  await assert.rejects(
    workflowModule.runMonthlyWorkflow(
      { yearMonth: "2026-09", spreadsheetId: "spreadsheet-for-2026", spendingFile: "spending.html" },
      {
        readSheet: async () => sheetValues,
        readSpendingHtml: async () =>
          '<button data-event-key="action.analytics.transaction-breakdown.click">Unknown 1 transaction - RON 10</button>',
        fetchPrice: async () => {
          throw new Error("market data should not be requested for invalid spending");
        },
        fetchExchangeRates: async () => [],
        writeUpdates: async () => {
          writeCount += 1;
        },
      },
    ),
    /not found in sheet categories/,
  );
  assert.equal(writeCount, 0);
});

test("APP-002: buildMonthlyUpdates targets the two-digit tab in the yearly spreadsheet", () => {
  assert.ok(workflowModule, "the monthly workflow module must be available");
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");

  const updates = workflowModule.buildMonthlyUpdates(
    "2027-01",
    layoutModule.analyzeMonthlySheet(sheetValues),
    [{ category: "Groceries", ron: 75 }],
    [{
      quote: { date: "2027-01-31", symbol: "AAPL", close: 191.5 },
    }],
    [{ date: "2027-01-31", currency: "EUR", ronPerUnit: 5.08 }],
  );

  assert.deepEqual(updates.map(({ range }) => range), [
    "'01'!D43",
    "'01'!D44",
    "'01'!B2",
    "'01'!C2",
    "'01'!D2",
    "'01'!B5",
    "'01'!C5",
  ]);
});

test("APP-002: writes the configured currencies for known ticker symbols", () => {
  assert.ok(workflowModule, "the monthly workflow module must be available");
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");

  const values = [
    ["Ticker", "Share Price", "Price Currency", "Price Date"],
    ["DE.EUNL", null, null, null],
    ["TVBETETF", null, null, null],
    ["DE.SXR8", null, null, null],
    ["AAPL", null, null, null],
    [null, null, null, null],
    ["Currency", "RON per Unit", "Rate Date"],
    ["EUR", null, null],
    ["RON", null, null],
    ["USD", null, null],
    [null, null, null, null],
    ["Kategória", null, "RON (N)", "RON (ZS)"],
    ["Groceries", null, null, null],
  ] as const;
  const layout = layoutModule.analyzeMonthlySheet(values.map((row) => [...row]));
  const updates = workflowModule.buildMonthlyUpdates(
    "2026-09",
    layout,
    [{ category: "Groceries", ron: 75 }],
    [
      { quote: { date: "2026-09-30", symbol: "DE.EUNL", close: 100.1 } },
      { quote: { date: "2026-09-30", symbol: "TVBETETF", close: 200.2 } },
      { quote: { date: "2026-09-30", symbol: "DE.SXR8", close: 300.3 } },
      { quote: { date: "2026-09-30", symbol: "AAPL", close: 400.4 } },
    ],
    [
      { date: "2026-09-30", currency: "EUR", ronPerUnit: 5.08 },
      { date: "2026-09-30", currency: "RON", ronPerUnit: 1 },
      { date: "2026-09-30", currency: "USD", ronPerUnit: 4.5 },
    ],
  );

  assert.deepEqual(
    updates.filter(({ range }) => /^'09'![A-Z]+[2-5]$/.test(range)),
    [
      { range: "'09'!B2", values: [[100.1]] },
      { range: "'09'!C2", values: [["EUR"]] },
      { range: "'09'!D2", values: [["2026-09-30"]] },
      { range: "'09'!B3", values: [[200.2]] },
      { range: "'09'!C3", values: [["RON"]] },
      { range: "'09'!D3", values: [["2026-09-30"]] },
      { range: "'09'!B4", values: [[300.3]] },
      { range: "'09'!C4", values: [["EUR"]] },
      { range: "'09'!D4", values: [["2026-09-30"]] },
      { range: "'09'!B5", values: [[400.4]] },
      { range: "'09'!C5", values: [["USD"]] },
      { range: "'09'!D5", values: [["2026-09-30"]] },
    ],
  );
});
