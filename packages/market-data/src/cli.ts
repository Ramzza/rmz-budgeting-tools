#!/usr/bin/env node
import { Command, Option } from "commander";
import { pathToFileURL } from "node:url";
import { fetchExchangeRates } from "./bnr.js";
import { parseDate } from "./dates.js";
import { MarketDataError } from "./errors.js";
import { fetchStockPriceData } from "./prices.js";

type OutputFormat = "json" | "csv";
type RecordRow = Record<string, string | number | null>;

function writeNumber(value: number | null, decimalPlaces: number | undefined): void {
  const text = value === null
    ? "null"
    : decimalPlaces === undefined
      ? String(value)
      : value.toFixed(decimalPlaces);
  process.stdout.write(`${text}\n`);
}

function priceDecimalPlaces(currency: string): number | undefined {
  switch (currency.toUpperCase()) {
    case "EUR":
    case "USD":
      return 2;
    case "RON":
      return 3;
    default:
      return undefined;
  }
}

function serializeRows(
  rows: readonly RecordRow[],
  format: OutputFormat,
  emptyColumns: readonly string[],
): string {
  if (format === "json") return JSON.stringify(rows, null, 2);

  const columns = rows.length === 0 ? emptyColumns : Object.keys(rows[0]);
  const escape = (value: string | number | null): string => {
    const text = value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((key) => escape(row[key] as string | number | null)).join(",")),
  ].join("\n");
}

function writeRows(
  rows: readonly object[],
  format: OutputFormat,
  emptyColumns: readonly string[],
): void {
  const fieldNames: Record<string, string> = {
    ronPerUnit: "ron_per_unit",
  };
  const records = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [fieldNames[key] ?? key, value]),
    ) as RecordRow,
  );
  process.stdout.write(`${serializeRows(records, format, emptyColumns)}\n`);
}

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("rmz-market-data")
    .description("Fetch historical stock, ETF, and RON exchange-rate data.");

  program
    .command("prices")
    .description("Fetch a daily stock or ETF closing price from Yahoo Finance")
    .argument("<symbol>", "Yahoo Finance ticker symbol")
    .requiredOption("--date <date>", "Requested date (YYYY-MM-DD)")
    .addOption(
      new Option("--format <format>", "Output format: number, json, or csv")
        .choices(["number", "json", "csv"])
        .default("number"),
    )
    .action(async (symbol: string, options: { date: string; format: string }) => {
      const { currency, quotes: results } = await fetchStockPriceData(
        symbol,
        parseDate(options.date),
      );
      const result = results[0];
      if (options.format === "number" && result !== undefined) {
        writeNumber(result.close, priceDecimalPlaces(currency));
      } else {
        const format = options.format === "number" ? "json" : options.format as OutputFormat;
        writeRows(results, format, ["date", "symbol", "close"]);
      }
    });

  program
    .command("exchange-rates")
    .description("Fetch daily RON exchange rates from cursbnr.ro")
    .requiredOption("--start <date>", "Requested date (YYYY-MM-DD)")
    .requiredOption("--end <date>", "Requested date (must match --start)")
    .requiredOption("--currencies <codes...>", "Exactly one currency code")
    .addOption(
      new Option("--format <format>", "Output format: number, json, or csv")
        .choices(["number", "json", "csv"])
        .default("number"),
    )
    .action(async (options: { start: string; end: string; currencies: string[]; format: string }) => {
      const start = parseDate(options.start);
      const end = parseDate(options.end);
      if (start.getTime() !== end.getTime()) {
        throw new MarketDataError(
          "exchange-rate requests require identical --start and --end dates",
        );
      }
      if (options.currencies.length !== 1) {
        throw new MarketDataError("exactly one currency code must be requested");
      }
      const rates = await fetchExchangeRates(
        start,
        end,
        options.currencies,
      );
      const result = rates[0];
      if (options.format === "number" && result !== undefined) {
        writeNumber(result.ronPerUnit, undefined);
      } else {
        const format = options.format === "number" ? "json" : options.format as OutputFormat;
        writeRows(rates, format, ["date", "currency", "ron_per_unit"]);
      }
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof MarketDataError) {
      process.stderr.write(`rmz-market-data: error: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
