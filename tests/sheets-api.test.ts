import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import {
  appendValues,
  getValues,
  updateBatchValues,
  updateValues,
  type Values,
} from "../src/google-sheets/sheets.js";

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
        batchUpdate: async (params: {
          spreadsheetId: string;
          requestBody: { valueInputOption: string; data: Array<{ range: string; values: Values }> };
        }) => {
          calls.push({ method: "batchUpdate", params });
          return { data: { totalUpdatedCells: params.requestBody.data.length } };
        },
      },
    },
  } as unknown as sheets_v4.Sheets;
  return { client, calls };
}

function createFailingClient(failure: unknown): sheets_v4.Sheets {
  const fail = async (): Promise<never> => {
    throw failure;
  };
  return {
    spreadsheets: {
      values: {
        get: fail,
        update: fail,
        append: fail,
        batchUpdate: fail,
      },
    },
  } as unknown as sheets_v4.Sheets;
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

test("SHEETS-005: sends discovered cell ranges in one USER_ENTERED batch", async () => {
  const { client, calls } = createClient(undefined);
  const updates = [
    { range: "'2026-09'!B2", values: [[25]] },
    { range: "'2026-09'!F2", values: [[190.5]] },
  ];
  const result = await updateBatchValues(client, "spreadsheet-1", updates);

  assert.deepEqual(result, { totalUpdatedCells: 2 });
  assert.deepEqual(calls, [{
    method: "batchUpdate",
    params: {
      spreadsheetId: "spreadsheet-1",
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    },
  }]);
});

test("SHEETS-006: explains how to refresh credentials after invalid_grant", async () => {
  const failure = new Error("invalid_grant");
  const client = createFailingClient(failure);
  const requests = [
    ["read", () => getValues(client, "spreadsheet-1", "Sheet1!A1:B1")],
    ["update", () => updateValues(client, "spreadsheet-1", "Sheet1!A1", [["Tea"]])],
    ["append", () => appendValues(client, "spreadsheet-1", "Sheet1!A:B", [["Tea"]])],
    [
      "batch update",
      () => updateBatchValues(client, "spreadsheet-1", [{ range: "Sheet1!A1", values: [["Tea"]] }]),
    ],
  ] as const;

  for (const [operation, request] of requests) {
    await assert.rejects(request, (error: unknown) => {
      assert.ok(error instanceof Error, `${operation} should reject with an Error`);
      assert.match(error.message, /Google Application Default Credentials.*invalid_grant/i);
      assert.match(error.message, /gcloud auth application-default login/);
      assert.equal(error.cause, failure);
      return true;
    });
  }
});

test("SHEETS-006: preserves unrelated Google Sheets errors", async () => {
  const failure = new Error("permission denied");
  const client = createFailingClient(failure);

  await assert.rejects(
    getValues(client, "spreadsheet-1", "Sheet1!A1:B1"),
    (error: unknown) => error === failure,
  );
});

test("SHEETS-006: explains string invalid_grant rejections", async () => {
  const failure = "invalid_grant";
  const client = createFailingClient(failure);

  await assert.rejects(
    getValues(client, "spreadsheet-1", "Sheet1!A1:B1"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Google Application Default Credentials.*invalid_grant/i);
      assert.equal(error.cause, failure);
      return true;
    },
  );
});

test("SHEETS-006: preserves unrelated non-Error Google Sheets failures", async () => {
  const failure = { code: "transport_error" };
  const client = createFailingClient(failure);

  await assert.rejects(
    getValues(client, "spreadsheet-1", "Sheet1!A1:B1"),
    (error: unknown) => error === failure,
  );
});
