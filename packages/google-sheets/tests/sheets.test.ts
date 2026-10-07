import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import {
  appendValues,
  getValues,
  updateValues,
  type Values,
} from "../src/sheets.js";

function createClient(returnedValues: Values | undefined): {
  client: sheets_v4.Sheets;
  calls: Array<{ method: string; params: unknown }>;
} {
  const calls: Array<{ method: string; params: unknown }> = [];
  const client = {
    spreadsheets: {
      values: {
        get: async (params: { spreadsheetId: string; range: string }) => {
          calls.push({ method: "get", params });
          return { data: returnedValues === undefined ? {} : { values: returnedValues } };
        },
        update: async (params: {
          spreadsheetId: string;
          range: string;
          valueInputOption: string;
          requestBody: { values: Values };
        }) => {
          calls.push({ method: "update", params });
          return { data: { updatedRange: params.range, updatedRows: params.requestBody.values.length } };
        },
        append: async (params: {
          spreadsheetId: string;
          range: string;
          valueInputOption: string;
          insertDataOption: string;
          requestBody: { values: Values };
        }) => {
          calls.push({ method: "append", params });
          return { data: { tableRange: params.range, updates: { updatedRows: params.requestBody.values.length } } };
        },
      },
    },
  } as unknown as sheets_v4.Sheets;
  return { client, calls };
}

test("PRD-001: reads the requested spreadsheet range as cell values", async () => {
  const { client, calls } = createClient([["Tea", 3]]);
  const values = await getValues(client, "spreadsheet-1", "Sheet1!A1:B1");
  assert.deepEqual(values, [["Tea", 3]]);
  assert.deepEqual(calls, [{
    method: "get",
    params: { spreadsheetId: "spreadsheet-1", range: "Sheet1!A1:B1" },
  }]);
});

test("PRD-001: returns an empty matrix when a range has no values", async () => {
  const { client } = createClient(undefined);
  assert.deepEqual(await getValues(client, "spreadsheet-1", "Sheet1!A1:B1"), []);
});

test("PRD-002: updates a scalar matrix using USER_ENTERED values", async () => {
  const { client, calls } = createClient(undefined);
  const values: Values = [["Name", "Count"], ["Tea", 3]];
  const result = await updateValues(client, "spreadsheet-1", "Sheet1!A1:B2", values);
  assert.deepEqual(result, { updatedRange: "Sheet1!A1:B2", updatedRows: 2 });
  assert.deepEqual(calls, [{
    method: "update",
    params: {
      spreadsheetId: "spreadsheet-1",
      range: "Sheet1!A1:B2",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    },
  }]);
});

test("PRD-002: appends rows with USER_ENTERED and INSERT_ROWS", async () => {
  const { client, calls } = createClient(undefined);
  const values: Values = [["Coffee", 5]];
  const result = await appendValues(client, "spreadsheet-1", "Sheet1!A:B", values);
  assert.deepEqual(result, { tableRange: "Sheet1!A:B", updates: { updatedRows: 1 } });
  assert.deepEqual(calls, [{
    method: "append",
    params: {
      spreadsheetId: "spreadsheet-1",
      range: "Sheet1!A:B",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    },
  }]);
});
