/**
 * Parse a date the API sent. Date-only values ("YYYY-MM-DD", and the month-day
 * "MM-DD" used for birthdays) are calendar dates, not instants: JavaScript
 * would read them as UTC midnight and then show the previous day to anyone west
 * of UTC (the diaspora). They are built in local time instead. Anything with a
 * time part is parsed normally. Returns null when the value is not a date.
 */
export function parseApiDate(value?: string | null): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  // A month-day value sits on a leap year so 29 Feb stays valid.
  const monthDay = /^(\d{2})-(\d{2})$/.exec(value);
  if (monthDay) return new Date(2000, Number(monthDay[1]) - 1, Number(monthDay[2]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's local calendar date as "YYYY-MM-DD" (compares correctly as a string). */
export function todayIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Whether an event is over: its last day (endsAt, else startsAt) is before
 * today's local date. Undated events are never treated as over.
 */
export function eventHasEnded(details: Readonly<{ startsAt?: string; endsAt?: string }>, today = todayIsoDate()): boolean {
  const last = (details.endsAt || details.startsAt || "").slice(0, 10);
  return last !== "" && last < today;
}
