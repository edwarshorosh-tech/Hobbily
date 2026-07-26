import { RecurrenceCompletion, RecurrenceException, RecurrenceRule } from "./Recurrence";

/**
 * Represents a single scheduled task or hobby session in the time manager.
 * A recurring activity is still exactly one Task record — `recurrence` makes
 * it the *base* record for a series (title/type/time/duration act as the
 * template every occurrence starts from); individual occurrence dates are
 * never stored as their own rows, they're computed by
 * services/recurrenceService.ts. `date`/`time` on a recurring base record
 * describe its first occurrence.
 */
export type Task = {
  id: string;
  title: string;
  /** "task" = general to-do; "hobby" = hobby practice session */
  type: "task" | "hobby";
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** 24h time string HH:MM, e.g. "14:30" */
  time: string;
  /** Duration in minutes */
  duration: number;
  /** Only meaningful for a one-off (non-recurring) task — a recurring series' per-occurrence completion lives in `completions` instead. Always false on a recurring base record. */
  completed: boolean;
  createdAt: string;
  /** Stable id shared by every Task record split off the same original series (see "This and following" edits) — absent on a one-off task. */
  seriesId?: string;
  /** Present only on a series' base record. Absent (or omitted) means a one-off task. */
  recurrence?: RecurrenceRule;
  /** Per-occurrence deletions/edits for a recurring series. Always empty/absent on a one-off task. */
  exceptions?: RecurrenceException[];
  /** Per-occurrence completions for a recurring series. Always empty/absent on a one-off task. */
  completions?: RecurrenceCompletion[];
};
