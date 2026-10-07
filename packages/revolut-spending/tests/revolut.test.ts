import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, serializeCsv } from "../src/csv.js";
import { getSpending, parseRevolutCsv, summarizeSpending } from "../src/revolut.js";

const sample = [
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Category",
  'Card Payment,Current,"2025-01-02 10:00:00","2025-01-02 10:01:00","Cafe, ""Main""",-12.50,0,EUR,COMPLETED,Restaurants',
  "Card Payment,Current,2025-01-03,,Pending shop,-8.00,0,EUR,PENDING,Shopping",
  "Card Payment,Current,2025-01-04,,Refund,5.00,0,EUR,COMPLETED,Shopping",
  "Card Payment,Current,2025-02-01,,Groceries,-20.25,0,EUR,COMPLETED,Groceries",
].join("\r\n");

test("PRD-001: parses quoted fields, escaped quotes, CRLF, and embedded newlines", () => {
  assert.deepEqual(parseCsv('a,b\r\n"hello, ""world""","line 1\nline 2"\r\n'), [
    ["a", "b"],
    ['hello, "world"', "line 1\nline 2"],
  ]);
});

test("PRD-001: rejects unterminated quoted CSV fields", () => {
  assert.throws(() => parseCsv('a,"unfinished'), /unterminated quoted field/);
});

test("serializes CSV values with proper quoting", () => {
  assert.equal(serializeCsv(["name", "amount"], [['Cafe, "Main"', -12.5]]), 'name,amount\n"Cafe, ""Main""",-12.5');
});

test("PRD-001: imports statement transactions and supports a BOM", () => {
  const transactions = parseRevolutCsv(`\uFEFF${sample}`);
  assert.equal(transactions.length, 4);
  assert.deepEqual(transactions[0], {
    date: "2025-01-02 10:01:00",
    description: 'Cafe, "Main"',
    amount: -12.5,
    currency: "EUR",
    state: "COMPLETED",
    category: "Restaurants",
    type: "Card Payment",
  });
});

test("PRD-001: uses started date when completed date is blank and handles missing optional columns", () => {
  const result = parseRevolutCsv("Started Date,Description,Amount\n2025-01-01,Shop,-1.25");
  assert.equal(result[0].date, "2025-01-01");
  assert.equal(result[0].currency, "");
});

test("returns an empty list for an empty file", () => {
  assert.deepEqual(parseRevolutCsv(""), []);
});

test("PRD-001: requires date, description, and amount columns", () => {
  assert.throws(() => parseRevolutCsv("Date,Description\n2025-01-01,Shop"), /must include Date/);
});

test("PRD-001: rejects missing dates and invalid amounts with their CSV row numbers", () => {
  assert.throws(
    () => parseRevolutCsv("Date,Description,Amount\n,Shop,-1"),
    /Missing date on CSV row 2/,
  );
  assert.throws(
    () => parseRevolutCsv("Date,Description,Amount\n2025-01-01,Shop,unknown"),
    /Invalid amount on CSV row 2/,
  );
});

test("PRD-002: selects only completed negative transactions within inclusive date bounds", () => {
  const transactions = parseRevolutCsv(sample);
  assert.deepEqual(
    getSpending(transactions, "2025-01-01", "2025-01-31").map(({ description }) => description),
    ['Cafe, "Main"'],
  );
});

test("PRD-003: summarizes totals by currency in sorted currency order", () => {
  const result = summarizeSpending([
    { date: "2025-01-01", description: "A", amount: -1.1, currency: "USD", state: "COMPLETED", category: "", type: "" },
    { date: "2025-01-01", description: "B", amount: -2.2, currency: "EUR", state: "COMPLETED", category: "", type: "" },
    { date: "2025-01-01", description: "C", amount: -3.3, currency: "USD", state: "COMPLETED", category: "", type: "" },
  ]);
  assert.deepEqual(result, [
    { currency: "EUR", transactionCount: 1, totalSpent: 2.2 },
    { currency: "USD", transactionCount: 2, totalSpent: 4.4 },
  ]);
});
