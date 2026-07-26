/**
 * Recurrence model for Task (types/Task.ts). Occurrences are never
 * pre-materialized into individual stored rows — a recurring task is a
 * single base Task record (title/type/time/duration act as the template)
 * plus a RecurrenceRule; services/recurrenceService.ts expands that into
 * concrete calendar occurrences on demand, for a requested date range only.
 */

export type RecurrenceType = "none" | "daily" | "weekly";

export type RecurrenceRule = {
  type: RecurrenceType;
  /** Always 1 today — every N-day/week custom intervals aren't supported yet. Kept as a field (not hardcoded inline) so that's a config change, not a model change, if ever added. */
  interval: 1;
  /** ISO weekday 1=Monday..7=Sunday. Only meaningful when type === "weekly" — ignored for "daily". */
  weekdays: number[];
  /** IANA timezone the series was created in (utils/dateUtils.ts's deviceTimeZone()) — occurrences are local-calendar-date based, never UTC-shifted, so this is carried for reference/display rather than used in generation math. */
  timeZone: string;
  /** YYYY-MM-DD — the series never has occurrences before this date, regardless of what weekday it falls on. */
  startsOn: string;
  ends: "never" | "on_date";
  /** YYYY-MM-DD, inclusive. Only meaningful when ends === "on_date". */
  until: string | null;
};

/** A per-occurrence override on a recurring series, keyed by that occurrence's local date. */
export type RecurrenceException =
  | { occurrenceDate: string; kind: "deleted" }
  | {
      occurrenceDate: string;
      kind: "edited";
      overrides: { title?: string; type?: "task" | "hobby"; time?: string; duration?: number };
    };

/** One occurrence marked done — completion is tracked per calendar date, never for the whole series at once. */
export type RecurrenceCompletion = { occurrenceDate: string; completedAt: string };

/** ISO weekday helpers — 1=Monday..7=Sunday, matching RecurrenceRule.weekdays. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const ISO_WEEKDAYS_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const ISO_WEEKDAYS_WEEKEND = [6, 7] as const;
