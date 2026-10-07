import YahooFinance from "yahoo-finance2";
import { formatDate, validateDate } from "./dates.js";
import { MarketDataError } from "./errors.js";

export interface PriceQuote {
  date: string;
  symbol: string;
  close: number | null;
}

const yahooFinance = new YahooFinance();

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
