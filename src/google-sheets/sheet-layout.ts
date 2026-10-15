import type { Values } from "./sheets.js";

export interface MonthlySheetRow {
  key: string;
  row: number;
}

export interface MonthlySheetTable {
  keyColumn: number;
  outputColumns: number[];
  rows: MonthlySheetRow[];
}

export interface MonthlySheetLayout {
  spending: MonthlySheetTable;
  prices: MonthlySheetTable;
  exchangeRates: MonthlySheetTable;
}

interface TableDefinition {
  label: string;
  headers: readonly string[];
}

const TABLES = {
  spending: {
    label: "spending",
    headers: ["Kategória", "RON (N)", "RON (ZS)"],
  },
  prices: {
    label: "share-price",
    headers: ["Ticker", "Share Price", "Price Currency", "Price Date"],
  },
  exchangeRates: {
    label: "exchange-rate",
    headers: ["Currency", "RON per Unit", "Rate Date"],
  },
} as const satisfies Record<keyof MonthlySheetLayout, TableDefinition>;

function normalizeHeader(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function findTable(
  values: Values,
  definition: TableDefinition,
): MonthlySheetTable {
  const candidates: Array<{ rowIndex: number; row: Values[number] }> = [];
  values.forEach((row, rowIndex) => {
    if (row.some((cell) => normalizeHeader(cell) === normalizeHeader(definition.headers[0]))) {
      candidates.push({ rowIndex, row });
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      `monthly sheet is missing the ${definition.label} table; expected headers: ${definition.headers.join(" | ")}`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(`monthly sheet has more than one ${definition.label} table`);
  }

  const candidate = candidates[0];
  if (!candidate) {
    throw new Error(`monthly sheet is missing the ${definition.label} table`);
  }
  const columns = definition.headers.map((header) => {
    const matchingColumns = candidate.row
      .map((cell, columnIndex) => normalizeHeader(cell) === normalizeHeader(header) ? columnIndex : -1)
      .filter((columnIndex) => columnIndex >= 0);
    if (matchingColumns.length !== 1) {
      throw new Error(
        `monthly sheet ${definition.label} table must contain exactly one "${header}" header`,
      );
    }
    return matchingColumns[0]!;
  });

  const keyColumn = columns[0]!;
  const outputColumns = columns.slice(1);
  const rows: MonthlySheetRow[] = [];
  const seenKeys = new Set<string>();
  for (let rowIndex = candidate.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    const cell = values[rowIndex]?.[keyColumn];
    if (cell === undefined || cell === null || cell === "") break;
    if (typeof cell !== "string" || cell.trim() === "") {
      throw new Error(
        `monthly sheet ${definition.label} key in row ${rowIndex + 1} must be non-empty text`,
      );
    }
    const key = cell.trim();
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (seenKeys.has(normalizedKey)) {
      throw new Error(`monthly sheet ${definition.label} table contains duplicate key "${key}"`);
    }
    seenKeys.add(normalizedKey);
    rows.push({ key, row: rowIndex + 1 });
  }

  return { keyColumn, outputColumns, rows };
}

function hasMarketTableHeaders(values: Values): boolean {
  const headers = [...TABLES.prices.headers, ...TABLES.exchangeRates.headers]
    .map(normalizeHeader);
  return values.some((row) => row.some((cell) => headers.includes(normalizeHeader(cell))));
}

function hasCompleteTableHeaders(values: Values, definition: TableDefinition): boolean {
  return values.some((row) => {
    const normalizedCells = row.map(normalizeHeader);
    return definition.headers.every(
      (header) => normalizedCells.filter((cell) => cell === normalizeHeader(header)).length === 1,
    );
  });
}

function hasPositionedMarketInputs(values: Values): boolean {
  const hasInput = (column: number, firstRow: number, lastRow: number): boolean => {
    for (let row = firstRow; row <= lastRow; row += 1) {
      const cell = values[row - 1]?.[column];
      if (cell !== undefined && cell !== null && cell !== "") return true;
    }
    return false;
  };
  return hasInput(1, 16, 18) || hasInput(5, 16, 30);
}

function findPositionedTable(
  values: Values,
  label: string,
  keyColumn: number,
  firstRow: number,
  lastRow: number,
  outputColumns: number[],
): MonthlySheetTable {
  const rows: MonthlySheetRow[] = [];
  const seenKeys = new Set<string>();
  for (let row = firstRow; row <= lastRow; row += 1) {
    const cell = values[row - 1]?.[keyColumn];
    if (cell === undefined || cell === null || cell === "") break;
    if (typeof cell !== "string" || cell.trim() === "") {
      throw new Error(`monthly sheet ${label} key in row ${row} must be non-empty text`);
    }
    const key = cell.trim();
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (seenKeys.has(normalizedKey)) {
      throw new Error(`monthly sheet ${label} table contains duplicate key "${key}"`);
    }
    seenKeys.add(normalizedKey);
    rows.push({ key, row });
  }

  return { keyColumn, outputColumns, rows };
}

export function analyzeMonthlySheet(values: Values): MonthlySheetLayout {
  const hasHeaderLayout =
    hasCompleteTableHeaders(values, TABLES.prices) &&
    hasCompleteTableHeaders(values, TABLES.exchangeRates);
  const marketTables = hasHeaderLayout ||
      (hasMarketTableHeaders(values) && !hasPositionedMarketInputs(values))
    ? {
        prices: findTable(values, TABLES.prices),
        exchangeRates: findTable(values, TABLES.exchangeRates),
      }
    : {
        prices: findPositionedTable(values, "share-price", 5, 16, 30, [6]),
        exchangeRates: findPositionedTable(values, "exchange-rate", 1, 16, 18, [2]),
      };

  return {
    spending: findTable(values, TABLES.spending),
    ...marketTables,
  };
}
