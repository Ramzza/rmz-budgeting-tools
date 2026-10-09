import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import {
  fillSpendings,
  mapCategorySpendingsToValues,
  parseCategorySpendings,
  validateYearMonth,
  type CategorySpend,
} from "../src/spendings.js";
import type { Values } from "../src/sheets.js";

function createClient(categories: Values): {
  client: sheets_v4.Sheets;
  calls: Array<{ method: string; params: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const client = {
    spreadsheets: {
      values: {
        get: async (params: Record<string, unknown>) => {
          calls.push({ method: "get", params });
          return { data: { values: categories } };
        },
        update: async (params: Record<string, unknown>) => {
          calls.push({ method: "update", params });
          const body = params.requestBody as { values: Values };
          return {
            data: {
              updatedRange: params.range,
              updatedRows: body.values.length,
            },
          };
        },
      },
    },
  } as unknown as sheets_v4.Sheets;
  return { client, calls };
}

test("SHEETS-004: accepts valid year-month values and rejects invalid months", () => {
  assert.equal(validateYearMonth("2026-09"), "2026-09");
  for (const value of ["0000-01", "2026-00", "2026-13", "2026-9", "26-09"]) {
    assert.throws(() => validateYearMonth(value), /year-month must use YYYY-MM format/i);
  }
});

test("SHEETS-004: validates the Revolut category JSON shape", () => {
  assert.deepEqual(parseCategorySpendings([{ category: "Groceries", ron: 25.5 }]), [
    { category: "Groceries", ron: 25.5 },
  ]);
  for (const value of [
    {},
    [{ category: "", ron: 1 }],
    [{ category: "Groceries", ron: -1 }],
    [{ category: "Groceries", ron: "25" }],
  ]) {
    assert.throws(() => parseCategorySpendings(value));
  }
});

test("SHEETS-004: aligns totals to sheet category rows and defaults missing totals to zero", () => {
  const categories: Values = [["Groceries"], ["Rent"], ["Transport"], ["Utilities"]];
  const spendings: CategorySpend[] = [
    { category: " rent ", ron: 500 },
    { category: "Rent", ron: 300 },
    { category: "GROCERIES", ron: 125.75 },
    { category: "Transport", ron: 0 },
  ];

  const values = mapCategorySpendingsToValues(categories, spendings);

  assert.deepEqual(values.slice(0, 4), [[125.75], [800], [0], [0]]);
  assert.equal(values.length, 28);
});

test("SHEETS-004: rejects input categories that are not present in the sheet", () => {
  assert.throws(
    () => mapCategorySpendingsToValues([["Groceries"]], [{ category: "Other", ron: 10 }]),
    /not found in sheet categories/i,
  );
  assert.throws(
    () =>
      mapCategorySpendingsToValues(
        [["Groceries"]],
        [
          { category: "Groceries", ron: Number.MAX_VALUE },
          { category: "groceries", ron: Number.MAX_VALUE },
        ],
      ),
    /total.*not finite/i,
  );
  assert.throws(
    () => mapCategorySpendingsToValues([[42]], [{ category: "Groceries", ron: 10 }]),
    /sheet category in row 43 must be text/i,
  );
});

test("SHEETS-004: reads categories and updates the profile column in the month tab", async () => {
  const categories: Values = [["Groceries"], ["Rent"]];
  const spendings = [{ category: "Rent", ron: 800 }, { category: "Groceries", ron: 125.75 }];

  for (const [profile, column] of [["N", "C"], ["Z", "D"]] as const) {
    const { client, calls } = createClient(categories);
    const result = await fillSpendings(client, "spreadsheet-1", "2026-09", profile, spendings);

    assert.deepEqual(result, {
      updatedRange: `'2026-09'!${column}43:${column}70`,
      updatedRows: 28,
    });
    assert.deepEqual(calls.map(({ method, params }) => ({ method, params })), [
      {
        method: "get",
        params: { spreadsheetId: "spreadsheet-1", range: "'2026-09'!A43:A70" },
      },
      {
        method: "update",
        params: {
          spreadsheetId: "spreadsheet-1",
          range: `'2026-09'!${column}43:${column}70`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [125.75],
              [800],
              ...Array.from({ length: 26 }, () => [0]),
            ],
          },
        },
      },
    ]);
  }
});
