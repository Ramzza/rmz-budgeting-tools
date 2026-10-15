import assert from "node:assert/strict";
import test from "node:test";

const workflowModule = await import("../src/monthly-workflow.js").catch(() => undefined);
const layoutModule = await import("../src/google-sheets/sheet-layout.js").catch(() => undefined);

const sheetValues = [
  ["Budget Category", "Revolut Spend (RON)", null, null, "Ticker", "Share Price", "Price Currency", "Price Date", null, "Currency", "RON per Unit", "Rate Date"],
  ["Groceries", null, null, null, "AAPL", null, null, null, null, "EUR", null, null],
  ["Transport", null, null, null, null, null, null, null, null, null, null, null],
];

test("APP-002: validates the full month and batches discovered spending, price, and rate cells", async () => {
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
          currency: "USD",
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
  assert.deepEqual(requestedCurrencies, [["EUR"]]);
  assert.deepEqual(writes, [
    { range: "'09'!B2", values: [[75]] },
    { range: "'09'!B3", values: [[0]] },
    { range: "'09'!F2", values: [[191.5]] },
    { range: "'09'!G2", values: [["USD"]] },
    { range: "'09'!H2", values: [["2026-09-30"]] },
    { range: "'09'!K2", values: [[5.08]] },
    { range: "'09'!L2", values: [["2026-09-30"]] },
  ]);
  assert.deepEqual(result, {
    yearMonth: "2026-09",
    asOfDate: "2026-09-30",
    updatedCells: 7,
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
      currency: "USD",
      quote: { date: "2027-01-31", symbol: "AAPL", close: 191.5 },
    }],
    [{ date: "2027-01-31", currency: "EUR", ronPerUnit: 5.08 }],
  );

  assert.deepEqual(updates.map(({ range }) => range), [
    "'01'!B2",
    "'01'!B3",
    "'01'!F2",
    "'01'!G2",
    "'01'!H2",
    "'01'!K2",
    "'01'!L2",
  ]);
});
