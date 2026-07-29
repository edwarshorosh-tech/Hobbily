/**
 * dateUtils — the app's single source of truth for "what day is it" in the
 * device's local (IANA) timezone.
 *
 * `Date#toISOString()` always converts to UTC before formatting, so
 * `new Date().toISOString().slice(0, 10)` silently returns *tomorrow's* date
 * for anyone west of UTC in the evening (and *yesterday's* for anyone east of
 * UTC before their local midnight-UTC offset). That bug was scattered across
 * TimeContext, the Planner screen, the Home greeting, and the streak
 * calculation — all now route through the local-date helpers below instead.
 */

/** Local YYYY-MM-DD for the given Date (defaults to now) — never UTC-shifted. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses a YYYY-MM-DD string as a local midnight Date (not UTC midnight). */
export function parseLocalISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Adds (or subtracts, with a negative value) whole days to a YYYY-MM-DD string, in local time. */
export function addDaysISO(iso: string, days: number): string {
  const d = parseLocalISO(iso);
  d.setDate(d.getDate() + days);
  return localDateISO(d);
}

/** The Monday (local) of the week containing the given YYYY-MM-DD date. */
export function startOfWeekISO(iso: string): string {
  const d = parseLocalISO(iso);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localDateISO(d);
}

/**
 * True if `selectedDate` (YYYY-MM-DD) is any day strictly before today, in
 * the device's local timezone — i.e. the *entire day* has already passed,
 * not just a specific time within it. Whole-day granularity, for gating
 * "can a new activity even be added to this day at all" (the Planner's Add
 * Activity button) — same-day, time-of-day granularity ("is 3pm today
 * already past") is a separate, existing check: isDateTimeInPast in
 * utils/time.ts. Deliberately takes `now` as a parameter (never reads
 * Date.now() internally) so it stays pure and trivially testable, matching
 * every other date helper in this file.
 */
export function isPastPlannerDate({ selectedDate, now = new Date() }: { selectedDate: string; now?: Date }): boolean {
  return selectedDate < localDateISO(now);
}

/**
 * True if an entire week (its last day, `weekEnd`) is already behind today —
 * lets week-level UI (e.g. graying out an already-fully-past week at a
 * glance) avoid checking every individual day in it.
 */
export function isEntireWeekInPast({ weekEnd, now = new Date() }: { weekEnd: string; now?: Date }): boolean {
  return weekEnd < localDateISO(now);
}

/** The device's IANA timezone identifier, e.g. "Asia/Jerusalem". */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * True only for a real calendar date in strict YYYY-MM-DD form (rejects
 * "2024-02-30", "2024-13-01", non-strings, and anything not zero-padded).
 * Never throws.
 */
export function isValidDateISO(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = parseLocalISO(value);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}
