import YahooFinance from "yahoo-finance2";
import { formatDate, validateDate } from "./dates.js";
import { MarketDataError } from "./errors.js";

export interface PriceQuote {
  date: string;
  symbol: string;
  close: number | null;
}

const yahooFinance = new YahooFinance();
const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchStockPriceData(
  symbol: string,
  date: Date,
): Promise<{ currency: string; quotes: PriceQuote[] }> {
  validateDate(date);
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) throw new MarketDataError("symbol must not be empty");
  const requestedDate = formatDate(date);

  const result = await yahooFinance.chart(normalizedSymbol, {
    period1: requestedDate,
    period2: new Date(Date.parse(`${requestedDate}T00:00:00.000Z`) + 24 * 60 * 60 * 1000),
    interval: "1d",
  });

  return {
    currency: result.meta.currency,
    quotes: result.quotes
      .filter((quote) => formatDate(quote.date) === requestedDate)
      .map((quote) => ({
        date: formatDate(quote.date),
        symbol: normalizedSymbol,
        close: finiteNumber(quote.close),
      })),
  };
}

export async function fetchStockPrices(
  symbol: string,
  date: Date,
): Promise<PriceQuote[]> {
  const { quotes } = await fetchStockPriceData(symbol, date);
  return quotes;
}

export async function fetchLatestStockPriceData(
  symbol: string,
  endDate: Date,
): Promise<{ currency: string; quote: PriceQuote | undefined }> {
  validateDate(endDate);
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) throw new MarketDataError("symbol must not be empty");
  const requestedDate = formatDate(endDate);
  const endTimestamp = Date.parse(`${requestedDate}T00:00:00.000Z`);
  const period1 = formatDate(new Date(endTimestamp - 31 * DAY_MS));
  const period2 = new Date(endTimestamp + DAY_MS);
  const result = await yahooFinance.chart(normalizedSymbol, {
    period1,
    period2,
    interval: "1d",
  });
  const latest = result.quotes
    .filter((quote) => {
      const quoteDate = formatDate(quote.date);
      return quoteDate <= requestedDate && finiteNumber(quote.close) !== null;
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .at(-1);
  const quote = latest
    ? {
        date: formatDate(latest.date),
        symbol: normalizedSymbol,
        close: finiteNumber(latest.close),
      }
    : undefined;

  return { currency: result.meta.currency, quote };
}
