import assert from "node:assert/strict";
import test from "node:test";

const layoutModule = await import("../src/google-sheets/sheet-layout.js").catch(() => undefined);

test("SHEETS-005: discovers category, ticker, and currency tables wherever they appear", () => {
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");

  const layout = layoutModule.analyzeMonthlySheet([
    ["Budget Category", "Revolut Spend (RON)", null, null, "Ticker", "Share Price", "Price Currency", "Price Date", null, "Currency", "RON per Unit", "Rate Date"],
    ["Groceries", null, null, null, "AAPL", null, null, null, null, "EUR", null, null],
    ["Transport", null, null, null, null, null, null, null, null, null, null, null],
  ]);

  assert.deepEqual(layout.spending, {
    keyColumn: 0,
    outputColumns: [1],
    rows: [
      { key: "Groceries", row: 2 },
      { key: "Transport", row: 3 },
    ],
  });
  assert.deepEqual(layout.prices, {
    keyColumn: 4,
    outputColumns: [5, 6, 7],
    rows: [{ key: "AAPL", row: 2 }],
  });
  assert.deepEqual(layout.exchangeRates, {
    keyColumn: 9,
    outputColumns: [10, 11],
    rows: [{ key: "EUR", row: 2 }],
  });
});

test("SHEETS-005: rejects incomplete or repeated table headers instead of guessing", () => {
  assert.ok(layoutModule, "the monthly sheet layout analyzer must be available");
  assert.throws(
    () => layoutModule.analyzeMonthlySheet([["Budget Category", "Revolut Spend (RON)"]]),
    /Ticker.*Share Price.*Price Currency.*Price Date/,
  );
  assert.throws(
    () => layoutModule.analyzeMonthlySheet([
      ["Budget Category", "Revolut Spend (RON)", null, null, "Ticker", "Share Price", "Price Currency", "Price Date"],
      ["Budget Category", "Revolut Spend (RON)", null, null, "Ticker", "Share Price", "Price Currency", "Price Date"],
    ]),
    /more than one/,
  );
});
