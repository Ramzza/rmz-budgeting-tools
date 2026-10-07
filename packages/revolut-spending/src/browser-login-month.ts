const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTH_NUMBERS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export interface AnalyticsMonth {
  year: number;
  month: number;
  label: string;
  monthsBack: number;
}

export function parseAnalyticsMonth(value: string, now = new Date()): AnalyticsMonth {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const normalized = value.toLowerCase();
  let year: number;
  let month: number;

  if (normalized === "current") {
    year = currentYear;
    month = currentMonth;
  } else if (normalized === "last") {
    const previous = new Date(currentYear, currentMonth - 2, 1);
    year = previous.getFullYear();
    month = previous.getMonth() + 1;
  } else {
    const match = /^(\d{4})-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.exec(value);
    const yearText = match?.[1];
    const monthToken = match?.[2]?.toLowerCase();
    const parsedMonth = monthToken ? MONTH_NUMBERS[monthToken] : undefined;
    if (!yearText || !parsedMonth) {
      throw new Error("Month must be last, current, or YYYY-mon");
    }
    year = Number(yearText);
    month = parsedMonth;
    if (year < 1) throw new Error("Month must use a year from 0001 to 9999");
  }

  const monthsBack = (currentYear - year) * 12 + currentMonth - month;
  if (monthsBack < 0) throw new Error("Requested month cannot be in the future");
  const monthLabel = MONTH_LABELS[month - 1];
  if (!monthLabel) throw new Error("Month must be last, current, or YYYY-mon");
  const label = year === currentYear
    ? month === currentMonth ? "This month" : monthLabel
    : `${monthLabel} ${year}`;

  return { year, month, label, monthsBack };
}
