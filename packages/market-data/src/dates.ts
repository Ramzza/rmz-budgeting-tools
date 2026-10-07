import { MarketDataError } from "./errors.js";

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MarketDataError(`invalid date "${value}"; use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new MarketDataError(`invalid date "${value}"; use YYYY-MM-DD`);
  }
  return parsed;
}

export function validateDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) {
    throw new MarketDataError("date must be a valid date");
  }
}

export function validateDateRange(start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new MarketDataError("start and end must be valid dates");
  }
  if (formatDate(start) > formatDate(end)) {
    throw new MarketDataError("start date must be on or before end date");
  }
}

export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
