import assert from "node:assert/strict";
import test from "node:test";
import { createSheetsClient, getValues } from "../src/sheets.js";

test("SHEETS-001: reads one populated Google Sheets cell using ADC", async () => {
  const spreadsheetId = process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_TEST_RANGE;

  assert.ok(
    typeof spreadsheetId === "string" && spreadsheetId.trim().length > 0,
    "Set GOOGLE_SHEETS_TEST_SPREADSHEET_ID.",
  );
  assert.ok(
    typeof range === "string" && range.trim().length > 0,
    "Set GOOGLE_SHEETS_TEST_RANGE to a single-cell A1 range.",
  );

  const sheets = await createSheetsClient();
  const values = await getValues(sheets, spreadsheetId, range);

  assert.equal(values.length, 1, "The configured range must return one populated cell.");
  assert.equal(values[0]?.length, 1, "The configured range must be a single-cell range.");
  assert.equal(values[0]?.[0], 300, "The configured cell must contain 300.");
});
