import assert from "node:assert/strict";
import test from "node:test";
import type { Values } from "../src/google-sheets/sheets.js";

const layoutModule = await import("../src/google-sheets/sheet-layout.js").catch(() => undefined);

test("SHEETS-005: discovers the current category profiles and market tables by their headers", () => {
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");

  const values: Values = Array.from({ length: 70 }, () => []);
  values[0] = ["Ticker", "Share Price", "Price Currency", "Price Date"];
  values[1] = ["AAPL", null, null, null];
  values[3] = ["Currency", "RON per Unit", "Rate Date"];
  values[4] = ["EUR", null, null];
  values[41] = ["Kategória", null, "RON (N)", "RON (ZS)"];
  for (let index = 0; index < 28; index += 1) {
    values[index + 42] = [`Category ${index + 1}`, null, null, null];
  }

  const layout = layoutModule.analyzeMonthlySheet(values);

  assert.deepEqual(layout.spending, {
    keyColumn: 0,
    outputColumns: [2, 3],
    rows: Array.from({ length: 28 }, (_, index) => ({
      key: `Category ${index + 1}`,
      row: index + 43,
    })),
  });
  assert.deepEqual(layout.prices, {
    keyColumn: 0,
    outputColumns: [1, 2, 3],
    rows: [{ key: "AAPL", row: 2 }],
  });
  assert.deepEqual(layout.exchangeRates, {
    keyColumn: 0,
    outputColumns: [1, 2],
    rows: [{ key: "EUR", row: 5 }],
  });
});

test("SHEETS-005: rejects incomplete or repeated table headers instead of guessing", () => {
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");
  assert.throws(
    () => layoutModule.analyzeMonthlySheet([
      ["Budget Category", "Revolut Spend (RON)"],
      ["Groceries", null],
      ["Ticker", "Share Price", "Price Currency", "Price Date"],
      ["AAPL", null, null, null],
      ["Currency", "RON per Unit", "Rate Date"],
      ["EUR", null, null],
    ]),
    /missing the spending table; expected headers: Kategória \| RON \(N\) \| RON \(ZS\)/,
  );
  assert.throws(
    () => layoutModule.analyzeMonthlySheet([["Kategória", null, "RON (N)"]]),
    /spending table must contain exactly one "RON \(ZS\)" header/,
  );
  assert.throws(
    () => layoutModule.analyzeMonthlySheet([
      ["Kategória", null, "RON (N)", "RON (ZS)"],
      ["Kategória", null, "RON (N)", "RON (ZS)"],
    ]),
    /more than one spending table/,
  );
});
