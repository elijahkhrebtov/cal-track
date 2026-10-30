export const TIME_ZONE = "Asia/Tashkent";

const DAY_MS = 86_400_000;

/** Calendar dates travel through the app as YYYY-MM-DD, never local midnights. */
export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function todayInTashkent(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(value: string, days: number): string {
  if (!isDateString(value) || !Number.isInteger(days)) {
    throw new RangeError("A valid date and whole number of days are required.");
  }

  const date = new Date(
    new Date(`${value}T00:00:00.000Z`).getTime() + days * DAY_MS,
  );
  const result = date.toISOString().slice(0, 10);
  if (!isDateString(result))
    throw new RangeError("The resulting date is out of range.");
  return result;
}

/** The preceding calendar dates in chronological order; excludes the given date. */
export function daysBefore(value: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("The day count must be a non-negative whole number.");
  }
  return Array.from({ length: count }, (_, index) =>
    addDays(value, index - count),
  );
}
