import { TZDate } from "@date-fns/tz";

/**
 * Pure time helpers shared by the booking engine, schedules and public pages.
 * No I/O and no ambient clock: every function that needs "now" receives it.
 *
 * Conventions (docs/database.md §1):
 * - instants are UTC `Date`s
 * - wall-clock times are "HH:mm" strings interpreted in a salon's IANA time zone
 * - weekdays are ISO: 0 = Monday … 6 = Sunday
 */

export const TIME_PATTERN = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** "09:30" → 570. Throws on invalid input. */
export function timeToMinutes(value: string): number {
  if (!isValidTime(value)) {
    throw new RangeError(`Invalid wall-clock time: ${value}`);
  }
  const [h, m] = value.split(":") as [string, string];
  return Number(h) * 60 + Number(m);
}

/** 570 → "09:30". 1440 → "24:00". */
export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new RangeError(`Minutes out of range: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function compareTimes(a: string, b: string): number {
  return timeToMinutes(a) - timeToMinutes(b);
}

/** JS `getDay()` (0 = Sunday) → ISO index (0 = Monday). */
export function jsDayToWeekday(jsDay: number): WeekdayIndex {
  return ((((jsDay + 6) % 7) + 7) % 7) as WeekdayIndex;
}

/** ISO weekday of an instant in a time zone. */
export function weekdayInTimeZone(instant: Date, timeZone: string): WeekdayIndex {
  return jsDayToWeekday(new TZDate(instant, timeZone).getDay());
}

/** "YYYY-MM-DD" of an instant in a time zone. */
export function localDateString(instant: Date, timeZone: string): string {
  const z = new TZDate(instant, timeZone);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** "HH:mm" of an instant in a time zone. */
export function localTimeString(instant: Date, timeZone: string): string {
  const z = new TZDate(instant, timeZone);
  return minutesToTime(z.getHours() * 60 + z.getMinutes());
}

export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** "YYYY-MM-DD" → UTC midnight Date (how `@db.Date` columns round-trip). */
export function dateStringToUtc(value: string): Date {
  if (!isValidDateString(value)) {
    throw new RangeError(`Invalid date: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

/** UTC-midnight Date (from a `@db.Date` column) → "YYYY-MM-DD". */
export function utcToDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function compareDateStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Wall-clock time on a local date in a time zone → UTC instant. Evaluated per
 * date so DST shifts are honoured (docs/booking-system.md §5). Non-existent
 * local times (spring-forward gap) resolve to the instant after the gap.
 */
export function wallClockToUtc(localDate: string, time: string, timeZone: string): Date {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  const minutes = timeToMinutes(time);
  const zoned = new TZDate(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0, timeZone);
  return new Date(zoned.getTime());
}
