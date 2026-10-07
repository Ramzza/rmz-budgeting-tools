import assert from "node:assert/strict";
import test from "node:test";
import YahooFinance from "yahoo-finance2";
import { MarketDataError } from "../src/errors.js";
import { fetchStockPrices } from "../src/prices.js";

test("PRD-001: accepts one date and returns only its close for a normalized symbol", async (t) => {
  const calls: Array<{ symbol: string; options: unknown }> = [];
  const quotes = [
    { date: new Date("2024-01-02T12:00:00Z"), close: 10 },
    { date: new Date("2024-01-03T12:00:00Z"), close: 11 },
    { date: new Date("2024-01-04T12:00:00Z"), close: 12 },
  ];
  t.mock.method(YahooFinance.prototype, "chart", async (symbol, options) => {
    calls.push({ symbol, options });
    return { meta: { currency: "USD" }, quotes } as never;
  });

  let result: Awaited<ReturnType<typeof fetchStockPrices>> = [];
  await assert.doesNotReject(async () => {
    result = await fetchStockPrices(" aapl ", new Date("2024-01-03T00:00:00Z"));
  });

  assert.deepEqual(result, [
    { date: "2024-01-03", symbol: "AAPL", close: 11 },
  ]);
  assert.deepEqual(calls, [{
    symbol: "AAPL",
    options: {
      period1: "2024-01-03",
      period2: new Date("2024-01-04T00:00:00.000Z"),
      interval: "1d",
    },
  }]);
});

test("PRD-001: represents a non-finite close as null", async (t) => {
  t.mock.method(YahooFinance.prototype, "chart", async () => ({
    meta: { currency: "USD" },
    quotes: [{
      date: new Date("2024-01-03T12:00:00Z"),
      close: Number.POSITIVE_INFINITY,
    }],
  }) as never);

  let result: Awaited<ReturnType<typeof fetchStockPrices>> = [];
  await assert.doesNotReject(async () => {
    result = await fetchStockPrices("AAPL", new Date("2024-01-03T00:00:00Z"));
  });

  assert.deepEqual(result, [
    { date: "2024-01-03", symbol: "AAPL", close: null },
  ]);
});

test("PRD-001: rejects an invalid date before requesting Yahoo Finance", async (t) => {
  let chartCalls = 0;
  t.mock.method(YahooFinance.prototype, "chart", async () => {
    chartCalls += 1;
    return { quotes: [] } as never;
  });

  await assert.rejects(
    fetchStockPrices("AAPL", new Date(Number.NaN)),
    (error: unknown) => error instanceof MarketDataError
      && error.message === "date must be a valid date",
  );
  assert.equal(chartCalls, 0);
});
