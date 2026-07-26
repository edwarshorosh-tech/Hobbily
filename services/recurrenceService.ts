/**
 * recurrenceService — pure expansion of Task base records (see types/Task.ts)
 * into concrete calendar occurrences, for a requested date range only. Never
 * generates unbounded occurrences and never mutates anything — a Task with a
 * `recurrence` rule stays exactly one stored record regardless of how many
 * occurrences it produces.
 *
 * Deliberately has zero AsyncStorage/Firebase import — every Planner screen
 * (day view, week glance, month glance) calls this with whatever range it's
 * currently displaying, and TimeContext.tsx's mutation helpers
 * (editOccurrence/deleteOccurrence) are the only things that turn an
 * Occurrence back into a real write.
 */
import { Task } from "../types/Task";
import { RecurrenceException, RecurrenceRule } from "../types/Recurrence";
import { addDaysISO, isValidDateISO, parseLocalISO } from "../utils/dateUtils";

export type Occurrence = {
  /** `${seriesId}:${occurrenceDate}` for a recurring task's occurrence, or the task's own id for a one-off — stable across re-renders/reloads, never random. */
  occurrenceId: string;
  /** The base Task record this occurrence was generated from (or is identical to, for a one-off). */
  task: Task;
  /** This occurrence's actual local calendar date — may differ from task.date for anything but the series' first occurrence. */
  date: string;
  title: string;
  type: "task" | "hobby";
  time: string;
  duration: number;
  completed: boolean;
  isRecurring: boolean;
};

/** ISO weekday (1=Monday..7=Sunday) for a YYYY-MM-DD date, in local calendar time. */
export function isoWeekday(dateISO: string): number {
  const jsDay = parseLocalISO(dateISO).getDay(); // 0=Sunday..6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

function findException(exceptions: RecurrenceException[] | undefined, occurrenceDate: string): RecurrenceException | undefined {
  return exceptions?.find((e) => e.occurrenceDate === occurrenceDate);
}

function isCompleted(task: Task, occurrenceDate: string): boolean {
  return Boolean(task.completions?.some((c) => c.occurrenceDate === occurrenceDate));
}

/** All local calendar dates in [rangeStart, rangeEnd] (inclusive) that a recurrence rule would fire on, ignoring exceptions — callers apply those separately so a "This activity" deletion doesn't have to be re-derived here. */
function ruleDatesInRange(task: Task, rangeStart: string, rangeEnd: string): string[] {
  const rule = task.recurrence;
  if (!rule || rule.type === "none") return [];

  const lowerBound = rule.startsOn > rangeStart ? rule.startsOn : rangeStart;
  const upperBoundCandidates = [rangeEnd];
  if (rule.ends === "on_date" && rule.until) upperBoundCandidates.push(rule.until);
  const upperBound = upperBoundCandidates.reduce((a, b) => (a < b ? a : b));

  if (lowerBound > upperBound) return [];

  const dates: string[] = [];
  let cursor = lowerBound;
  // Bounded by the caller's own range — never iterates past upperBound, so
  // this can never run away even with `ends: "never"`.
  while (cursor <= upperBound) {
    if (rule.type === "daily" || (rule.type === "weekly" && rule.weekdays.includes(isoWeekday(cursor)))) {
      dates.push(cursor);
    }
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

/**
 * Expands `tasks` into concrete Occurrence rows falling within
 * [rangeStart, rangeEnd] (inclusive, both YYYY-MM-DD). One-off tasks pass
 * through unchanged (still filtered to the range); recurring base records
 * are expanded per their rule, with deleted exceptions dropped and edited
 * exceptions' field overrides applied.
 */
export function getOccurrencesForRange({
  tasks,
  rangeStart,
  rangeEnd,
}: {
  tasks: Task[];
  rangeStart: string;
  rangeEnd: string;
}): Occurrence[] {
  if (!isValidDateISO(rangeStart) || !isValidDateISO(rangeEnd) || rangeStart > rangeEnd) return [];

  const result: Occurrence[] = [];

  for (const task of tasks) {
    if (!task.recurrence || task.recurrence.type === "none") {
      if (task.date >= rangeStart && task.date <= rangeEnd) {
        result.push({
          occurrenceId: task.id,
          task,
          date: task.date,
          title: task.title,
          type: task.type,
          time: task.time,
          duration: task.duration,
          completed: task.completed,
          isRecurring: false,
        });
      }
      continue;
    }

    const seriesId = task.seriesId ?? task.id;
    for (const date of ruleDatesInRange(task, rangeStart, rangeEnd)) {
      const exception = findException(task.exceptions, date);
      if (exception?.kind === "deleted") continue;

      const overrides = exception?.kind === "edited" ? exception.overrides : undefined;
      result.push({
        occurrenceId: `${seriesId}:${date}`,
        task,
        date,
        title: overrides?.title ?? task.title,
        type: overrides?.type ?? task.type,
        time: overrides?.time ?? task.time,
        duration: overrides?.duration ?? task.duration,
        completed: isCompleted(task, date),
        isRecurring: true,
      });
    }
  }

  return result;
}

/** The first date a series would actually produce an occurrence on — may be later than recurrence.startsOn if startsOn's weekday isn't in a weekly rule's weekdays. Used for the "Repeats every Mon/Wed/Fri starting <date>" summary. Returns null if the rule can never fire (e.g. empty weekdays, or until before startsOn). */
export function firstOccurrenceDate(task: Task): string | null {
  const rule = task.recurrence;
  if (!rule || rule.type === "none") return task.date;
  const upperBound = rule.ends === "on_date" && rule.until ? rule.until : addDaysISO(rule.startsOn, 3660); // ~10y safety cap, never actually reached for a real "never"-ending weekly rule
  const dates = ruleDatesInRange(task, rule.startsOn, upperBound);
  return dates[0] ?? null;
}

// ── Scoped edit/delete ───────────────────────────────────────────────────────
// Pure functions computing the next `tasks` array for a "This / This and
// following / All" choice on a recurring occurrence — TimeContext.tsx's
// editOccurrence/deleteOccurrence just call these and persist the result, so
// the actual splitting/exception logic is independently testable without
// AsyncStorage. `occurrence` must have come from getOccurrencesForRange (its
// `.task` is always the current base record from the same `tasks` array the
// caller is about to update).

export type OccurrenceEditScope = "this" | "following" | "all";
export type OccurrenceDeleteScope = "this" | "following" | "series";

export type OccurrenceFieldEdits = {
  title: string;
  type: "task" | "hobby";
  time: string;
  duration: number;
};

function findBase(tasks: Task[], occurrence: Occurrence): Task {
  const base = tasks.find((t) => t.id === occurrence.task.id);
  if (!base) throw new Error(`applyOccurrenceEdit/Delete: base task ${occurrence.task.id} not found — occurrence came from a stale tasks array`);
  return base;
}

/**
 * Edits one occurrence of a recurring series.
 * - "this": the series gets a "deleted" exception for this date, and a brand
 *   new one-off task (no seriesId/recurrence) is appended with the edited
 *   fields — the returned array's LAST element is that new one-off task.
 * - "following": the old series is truncated to end the day before this
 *   occurrence (or, if this occurrence IS the series' first, this degrades
 *   to "all" — there's no earlier fragment left to keep). A new series (new
 *   id, new seriesId) starts from this occurrence with the edited fields,
 *   decoupled from the old one.
 * - "all": the base record's template fields are updated in place; existing
 *   exceptions/completions are left as-is (they stay correctly keyed by date).
 * `newId` is injected (not `Date.now().toString()` inline) purely so this
 * stays deterministic/testable — TimeContext.tsx passes the real generator.
 * `newRule`, when given a rule, replaces the series' weekday/ends pattern for
 * "following" (as the new series' rule, `startsOn` still forced to this
 * occurrence's date) and "all" (replaces the base record's rule outright);
 * omitted (`undefined`), both keep reusing the existing rule's pattern
 * unchanged. Passed explicitly as `null`, both instead strip recurrence
 * entirely — "following" splits off a plain one-off task (no seriesId/
 * recurrence) instead of a new series, and "all" collapses the whole series
 * into a single non-recurring task — this is how "turn Repeat off" while
 * editing an existing occurrence is expressed as ONE atomic array
 * transform, so the caller never has to chain a separate delete + add (that
 * used to race: two sequential TimeContext calls each closing over the same
 * pre-mutation `tasks` snapshot, so the second call's persist silently
 * clobbered the first).
 */
export function applyOccurrenceEdit(
  tasks: Task[],
  occurrence: Occurrence,
  scope: OccurrenceEditScope,
  fields: OccurrenceFieldEdits,
  newId: () => string,
  newRule?: RecurrenceRule | null
): Task[] {
  const base = findBase(tasks, occurrence);
  const rule = base.recurrence;
  if (!rule) {
    // Not actually recurring (defensive — the UI never offers scope choices
    // for a one-off) — just apply the edit directly.
    return tasks.map((t) => (t.id === base.id ? { ...t, ...fields } : t));
  }

  if (scope === "this") {
    const exceptions = [...(base.exceptions ?? []).filter((e) => e.occurrenceDate !== occurrence.date), { occurrenceDate: occurrence.date, kind: "deleted" as const }];
    const replacement: Task = {
      id: newId(),
      title: fields.title,
      type: fields.type,
      date: occurrence.date,
      time: fields.time,
      duration: fields.duration,
      completed: occurrence.completed,
      createdAt: new Date().toISOString(),
    };
    return [...tasks.map((t) => (t.id === base.id ? { ...t, exceptions } : t)), replacement];
  }

  if (scope === "following") {
    const isFirstOccurrence = occurrence.date <= (firstOccurrenceDate(base) ?? occurrence.date);
    if (isFirstOccurrence) {
      // No earlier fragment of the series survives — same result as "all".
      if (newRule === null) {
        return tasks.map((t) => (t.id === base.id ? { ...t, ...fields, recurrence: undefined, seriesId: undefined, exceptions: undefined, completions: undefined } : t));
      }
      return tasks.map((t) => (t.id === base.id ? { ...t, ...fields, ...(newRule ? { recurrence: newRule } : null) } : t));
    }
    const truncatedOldRule: RecurrenceRule = { ...rule, ends: "on_date", until: addDaysISO(occurrence.date, -1) };
    const newSeriesId = newId();
    const newSeries: Task = newRule === null
      ? {
          id: newSeriesId,
          title: fields.title,
          type: fields.type,
          date: occurrence.date,
          time: fields.time,
          duration: fields.duration,
          completed: false,
          createdAt: new Date().toISOString(),
        }
      : {
          id: newSeriesId,
          seriesId: newSeriesId,
          title: fields.title,
          type: fields.type,
          date: occurrence.date,
          time: fields.time,
          duration: fields.duration,
          completed: false,
          createdAt: new Date().toISOString(),
          recurrence: { ...(newRule ?? rule), startsOn: occurrence.date },
        };
    return [...tasks.map((t) => (t.id === base.id ? { ...t, recurrence: truncatedOldRule } : t)), newSeries];
  }

  // scope === "all"
  if (newRule === null) {
    return tasks.map((t) => (t.id === base.id ? { ...t, ...fields, recurrence: undefined, seriesId: undefined, exceptions: undefined, completions: undefined } : t));
  }
  return tasks.map((t) => (t.id === base.id ? { ...t, ...fields, ...(newRule ? { recurrence: newRule } : null) } : t));
}

/**
 * Deletes one occurrence of a recurring series.
 * - "this": adds a "deleted" exception for this date only.
 * - "following": truncates the series to end the day before this occurrence,
 *   or (if this IS the first occurrence) removes the whole base record —
 *   there'd be nothing left for it to generate.
 * - "series": removes the whole base record.
 */
export function applyOccurrenceDelete(tasks: Task[], occurrence: Occurrence, scope: OccurrenceDeleteScope): Task[] {
  const base = findBase(tasks, occurrence);
  const rule = base.recurrence;
  if (!rule) return tasks.filter((t) => t.id !== base.id);

  if (scope === "series") return tasks.filter((t) => t.id !== base.id);

  if (scope === "following") {
    const isFirstOccurrence = occurrence.date <= (firstOccurrenceDate(base) ?? occurrence.date);
    if (isFirstOccurrence) return tasks.filter((t) => t.id !== base.id);
    return tasks.map((t) => (t.id === base.id ? { ...t, recurrence: { ...rule, ends: "on_date" as const, until: addDaysISO(occurrence.date, -1) } } : t));
  }

  // scope === "this"
  const exceptions = [...(base.exceptions ?? []).filter((e) => e.occurrenceDate !== occurrence.date), { occurrenceDate: occurrence.date, kind: "deleted" as const }];
  return tasks.map((t) => (t.id === base.id ? { ...t, exceptions } : t));
}
