import { parseCsv } from "./csv.js";

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  currency: string;
  state: string;
  category: string;
  type: string;
}

export interface SpendingSummary {
  currency: string;
  transactionCount: number;
  totalSpent: number;
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function parseAmount(value: string, rowNumber: number): number {
  const normalized = value.trim().replaceAll(",", "");
  const amount = Number(normalized);
  if (normalized.length === 0 || !Number.isFinite(amount)) {
    throw new Error(`Invalid amount on CSV row ${rowNumber}: "${value}"`);
  }
  return amount;
}

export function parseRevolutCsv(input: string): Transaction[] {
  const rows = parseCsv(input);
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  const column = (...names: string[]): number =>
    headers.findIndex((header) => names.includes(header));
  const amountColumn = column("amount");
  const completedDateColumn = column("completed date");
  const startedDateColumn = column("started date");
  const dateColumn = column("date");
  const descriptionColumn = column("description");
  if (
    amountColumn < 0 ||
    (completedDateColumn < 0 && startedDateColumn < 0 && dateColumn < 0) ||
    descriptionColumn < 0
  ) {
    throw new Error("CSV must include Date (or Completed Date/Started Date), Description, and Amount columns");
  }

  const currencyColumn = column("currency");
  const stateColumn = column("state");
  const categoryColumn = column("category");
  const typeColumn = column("type");
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const get = (columnIndex: number): string =>
      columnIndex < 0 ? "" : (row[columnIndex] ?? "").trim();
    const date =
      get(completedDateColumn) || get(startedDateColumn) || get(dateColumn);
    if (!date) throw new Error(`Missing date on CSV row ${rowNumber}`);
    return {
      date,
      description: get(descriptionColumn),
      amount: parseAmount(get(amountColumn), rowNumber),
      currency: get(currencyColumn),
      state: get(stateColumn),
      category: get(categoryColumn),
      type: get(typeColumn),
    };
  });
}

export function getSpending(
  transactions: readonly Transaction[],
  from?: string,
  to?: string,
): Transaction[] {
  return transactions.filter((transaction) => {
    if (transaction.amount >= 0 || transaction.state.toLowerCase() !== "completed") return false;
    const date = transaction.date.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
}

export function summarizeSpending(transactions: readonly Transaction[]): SpendingSummary[] {
  const totals = new Map<string, { transactionCount: number; totalSpent: number }>();
  for (const transaction of transactions) {
    const current = totals.get(transaction.currency) ?? { transactionCount: 0, totalSpent: 0 };
    current.transactionCount += 1;
    current.totalSpent += Math.abs(transaction.amount);
    totals.set(transaction.currency, current);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => ({
      currency,
      transactionCount: total.transactionCount,
      totalSpent: Number(total.totalSpent.toFixed(2)),
    }));
}
