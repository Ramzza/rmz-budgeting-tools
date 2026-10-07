import { load } from "cheerio";
import { formatDate, validateDateRange } from "./dates.js";
import { MarketDataError } from "./errors.js";

export const DEFAULT_CURRENCIES = ["EUR", "USD", "HUF"] as const;

export interface ExchangeRate {
  date: string;
  currency: string;
  ronPerUnit: number;
}

const ARCHIVE_URL = "https://www.cursbnr.ro/arhiva-curs-bnr-";
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseRates(
  page: string,
  currencies: readonly string[],
  rateDate: string,
): ExchangeRate[] {
  const $ = load(page);
  const parsed = new Map<string, number>();

  $("tr").each((_index, row) => {
    const cells = $(row)
      .find("td")
      .map((_cellIndex, cell) => $(cell).text().trim().replace(/\s+/g, " "))
      .get();
    if (cells.length < 3) return;

    const match = /^(100)?([A-Z]{3})$/.exec(cells[0]);
    if (!match) return;
    const unit = Number(match[1] ?? 1);
    const value = Number(cells[2].replace(",", "."));
    if (Number.isFinite(value)) {
      parsed.set(match[2], Number((value / unit).toFixed(12)));
    }
  });

  const missing = currencies.filter((currency) => !parsed.has(currency));
  if (missing.length > 0) {
    throw new MarketDataError(
      `cursbnr.ro has no ${missing.join(", ")} rate for ${rateDate}`,
    );
  }

  return currencies.map((currency) => ({
    date: rateDate,
    currency,
    ronPerUnit: parsed.get(currency)!,
  }));
}

export async function fetchExchangeRates(
  start: Date,
  end: Date,
  currencies: readonly string[] = DEFAULT_CURRENCIES,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangeRate[]> {
  validateDateRange(start, end);
  const normalizedCurrencies = currencies.map((currency) => currency.trim().toUpperCase());
  if (normalizedCurrencies.length === 0 || normalizedCurrencies.some((currency) => !currency)) {
    throw new MarketDataError("at least one non-empty currency code is required");
  }
  if (new Set(normalizedCurrencies).size !== normalizedCurrencies.length) {
    throw new MarketDataError("currency codes must not contain duplicates");
  }

  const results: ExchangeRate[] = [];
  const firstDay = Date.parse(`${formatDate(start)}T00:00:00.000Z`);
  const lastDay = Date.parse(`${formatDate(end)}T00:00:00.000Z`);
  for (let timestamp = firstDay; timestamp <= lastDay; timestamp += DAY_MS) {
    const rateDate = formatDate(new Date(timestamp));
    let response: Response;
    try {
      response = await fetchImpl(`${ARCHIVE_URL}${rateDate}`, {
        headers: { "User-Agent": "rmz-market-data/0.1" },
      });
    } catch (error) {
      throw new MarketDataError(
        `could not retrieve cursbnr.ro rates for ${rateDate}: ${String(error)}`,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new MarketDataError(
        `cursbnr.ro returned HTTP ${response.status} for ${rateDate}`,
      );
    }
    results.push(...parseRates(await response.text(), normalizedCurrencies, rateDate));
  }
  return results;
}
