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
