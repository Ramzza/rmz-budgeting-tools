import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchExchangeRates,
  parseRates,
} from "../src/bnr.js";
import { MarketDataError } from "../src/errors.js";

const ratePage = `
<table>
  <tr><td>EUR</td><td><span>Euro</span></td><td>4.9746</td><td>0</td></tr>
  <tr><td>USD</td><td>Dolarul SUA</td><td>4.4958</td><td>0</td></tr>
  <tr><td>100HUF</td><td>100 Forinți maghiari</td><td>1.2995</td><td>0</td></tr>
</table>
`;

test("PRD-002: parses rates and normalizes the HUF quote", () => {
  const rates = parseRates(ratePage, ["EUR", "USD", "HUF"], "2024-01-02");
  assert.deepEqual(rates.slice(0, 2), [
    { date: "2024-01-02", currency: "EUR", ronPerUnit: 4.9746 },
    { date: "2024-01-02", currency: "USD", ronPerUnit: 4.4958 },
  ]);
  assert.equal(rates[2].currency, "HUF");
  assert.ok(Math.abs(rates[2].ronPerUnit - 0.012995) < Number.EPSILON);
});

test("PRD-002: fetches each inclusive date", async () => {
  const urls: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(ratePage, { status: 200 });
  };

  const rates = await fetchExchangeRates(
    new Date("2024-01-02T00:00:00Z"),
    new Date("2024-01-03T00:00:00Z"),
    undefined,
    mockFetch,
  );
  assert.equal(rates.length, 6);
  assert.deepEqual(urls, [
    "https://www.cursbnr.ro/arhiva-curs-bnr-2024-01-02",
    "https://www.cursbnr.ro/arhiva-curs-bnr-2024-01-03",
  ]);
});

test("PRD-002: treats dates as whole calendar days", async () => {
  const urls: string[] = [];
  const mockFetch: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(ratePage, { status: 200 });
  };

  const rates = await fetchExchangeRates(
    new Date("2024-01-02T08:00:00Z"),
    new Date("2024-01-02T18:00:00Z"),
    ["EUR"],
    mockFetch,
  );
  assert.equal(rates.length, 1);
  assert.deepEqual(urls, ["https://www.cursbnr.ro/arhiva-curs-bnr-2024-01-02"]);
});

test("PRD-002: reports missing currencies and reversed ranges", async () => {
  assert.throws(
    () => parseRates("<table><tr><td>EUR</td><td>Euro</td><td>4.9</td></tr></table>", ["HUF"], "2024-01-02"),
    /has no HUF rate/,
  );
  await assert.rejects(
    fetchExchangeRates(new Date("2024-01-03"), new Date("2024-01-02")),
    MarketDataError,
  );
});
