import type { sheets_v4 } from "googleapis";
import { getValues, updateValues, type Values } from "./sheets.js";

const FIRST_CATEGORY_ROW = 43;
const LAST_CATEGORY_ROW = 70;
const CATEGORY_ROW_COUNT = LAST_CATEGORY_ROW - FIRST_CATEGORY_ROW + 1;

export interface CategorySpend {
  category: string;
  ron: number;
}

export type SpendingProfile = "N" | "Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateYearMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match || Number(match[1]) === 0) {
    throw new Error("year-month must use YYYY-MM format with a valid month");
  }
  return value;
}

export function parseCategorySpendings(value: unknown): CategorySpend[] {
  if (!Array.isArray(value)) {
    throw new Error("spending input must be a JSON array of category and ron values");
  }
  const spendings: CategorySpend[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new Error("each spending entry must be an object");
    }
    const category = entry.category;
    const ron = entry.ron;
    if (typeof category !== "string" || category.trim() === "") {
      throw new Error("each spending entry must have a non-empty category");
    }
    if (typeof ron !== "number" || !Number.isFinite(ron) || ron < 0) {
      throw new Error("each spending entry must have a non-negative numeric ron value");
    }
    spendings.push({ category: category.trim(), ron });
  }
  return spendings;
}

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

export function mapCategorySpendingsToValues(
  sheetCategories: Values,
  spendings: CategorySpend[],
): Values {
  const totals = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const spending of spendings) {
    const category = spending.category.trim();
    if (!category || !Number.isFinite(spending.ron) || spending.ron < 0) {
      throw new Error("spending entries must have a non-empty category and non-negative amount");
    }
    const normalized = normalizeCategory(category);
    const total = (totals.get(normalized) ?? 0) + spending.ron;
    if (!Number.isFinite(total)) {
      throw new Error(`spending total for category ${category} is not finite`);
    }
    totals.set(normalized, total);
    labels.set(normalized, category);
  }

  const matched = new Set<string>();
  const values: Values = [];
  for (let index = 0; index < CATEGORY_ROW_COUNT; index += 1) {
    const cell = sheetCategories[index]?.[0];
    if (cell !== undefined && cell !== null && cell !== "" && typeof cell !== "string") {
      throw new Error(`sheet category in row ${FIRST_CATEGORY_ROW + index} must be text`);
    }
    const normalized = typeof cell === "string" ? normalizeCategory(cell) : "";
    const amount = normalized ? totals.get(normalized) ?? 0 : 0;
    if (normalized && totals.has(normalized)) matched.add(normalized);
    values.push([amount]);
  }

  const unmatched = [...totals.keys()].filter((category) => !matched.has(category));
  if (unmatched.length > 0) {
    const categories = unmatched.map((category) => labels.get(category) ?? category);
    throw new Error(`spending categories not found in sheet categories: ${categories.join(", ")}`);
  }
  return values;
}

export async function fillSpendings(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  yearMonth: string,
  profile: SpendingProfile,
  spendings: CategorySpend[],
): Promise<sheets_v4.Schema$UpdateValuesResponse> {
  const month = validateYearMonth(yearMonth);
  if (profile !== "N" && profile !== "Z") {
    throw new Error("profile must be N or Z");
  }
  const categoryRange = `'${month}'!A${FIRST_CATEGORY_ROW}:A${LAST_CATEGORY_ROW}`;
  const categories = await getValues(sheets, spreadsheetId, categoryRange);
  const values = mapCategorySpendingsToValues(categories, spendings);
  const column = profile === "N" ? "C" : "D";
  const spendingRange = `'${month}'!${column}${FIRST_CATEGORY_ROW}:${column}${LAST_CATEGORY_ROW}`;
  return updateValues(sheets, spreadsheetId, spendingRange, values);
}
