/**
 * TimeContext
 * Provides time management state: tasks, hobby sessions, and daily reminder toggle.
 * All data is persisted to AsyncStorage.
 */
import { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "../types/Task";
import { localDateISO, isValidDateISO, parseLocalISO } from "../utils/dateUtils";
import { isDateTimeInPast, parseTimeString, timeStringToMinutes } from "../utils/time";
import { isValidDurationMinutes } from "../utils/duration";
import { RecurrenceRule } from "../types/Recurrence";
import {
  applyOccurrenceDelete,
  applyOccurrenceEdit,
  getOccurrencesForRange,
  Occurrence,
  OccurrenceDeleteScope,
  OccurrenceEditScope,
  OccurrenceFieldEdits,
} from "../services/recurrenceService";

const TASKS_KEY = "@hobbily_tasks";
const REMINDER_KEY = "@hobbily_daily_reminder";
const REMINDER_SHOWN_KEY = "@hobbily_reminder_shown_date";
const NOTIFIED_KEY = "@hobbily_notified_tasks";

/** How long after its scheduled time a task is still eligible to trigger the due popup. */
const DUE_WINDOW_MS = 2 * 60 * 1000;
/** How often to check whether any task has become due. */
const DUE_CHECK_INTERVAL_MS = 15 * 1000;

export type TaskSaveResult =
  | { ok: true }
  | { ok: false; reason: "conflict"; conflict: Task }
  | { ok: false; reason: "past" }
  | { ok: false; reason: "invalid"; message: string };

/** True if the given date+time is earlier than the current moment. Invalid date/time is never "past" — callers must validate first. */
export function isPastDateTime(date: string, time: string): boolean {
  const parsedTime = parseTimeString(time);
  if (!isValidDateISO(date) || !parsedTime) return false;
  return isDateTimeInPast(date, parsedTime);
}

/** Rejects a task whose date/time/duration don't hold up on their own — the last line of defense before a value reaches AsyncStorage, regardless of which UI path produced it (manual, edit, or AI-created). */
function validateTaskFields(fields: { date: string; time: string; duration: number }): string | null {
  if (!isValidDateISO(fields.date)) return "That date isn't valid.";
  if (!parseTimeString(fields.time)) return "That time isn't valid.";
  // Wider than the Planner slider's own 5-240 range (see utils/duration.ts) so
  // this repository-level check stays a sanity backstop for every caller —
  // manual, edited, and AI-created alike — without re-litigating the
  // slider's UX bounds; 480 matches the AI worker's own MAX_DURATION.
  if (!isValidDurationMinutes(fields.duration, { min: 1, max: 480 })) return "That duration isn't valid.";
  return null;
}

/** Finds a same-day task whose [time, time+duration) range overlaps the candidate's, excluding excludeId (used when editing). */
function findOverlap(
  existing: Task[],
  candidate: { date: string; time: string; duration: number },
  excludeId?: string
): Task | null {
  const start = timeStringToMinutes(candidate.time);
  if (start === null) return null;
  const end = start + candidate.duration;
  for (const t of existing) {
    if (t.id === excludeId || t.date !== candidate.date) continue;
    const tStart = timeStringToMinutes(t.time);
    if (tStart === null) continue;
    const tEnd = tStart + t.duration;
    if (start < tEnd && tStart < end) return t;
  }
  return null;
}

type TimeContextType = {
  tasks: Task[];
  dailyReminderEnabled: boolean;
  showDailyBanner: boolean;
  isLoading: boolean;
  addTask: (task: Omit<Task, "id" | "createdAt">) => Promise<TaskSaveResult>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<TaskSaveResult>;
  deleteTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  /** Recurring-series equivalents of updateTask/deleteTask/toggleComplete — see services/recurrenceService.ts for the this/following/all(/series) split logic. */
  editOccurrence: (occurrence: Occurrence, scope: OccurrenceEditScope, fields: OccurrenceFieldEdits, newRule?: RecurrenceRule | null) => Promise<TaskSaveResult>;
  deleteOccurrence: (occurrence: Occurrence, scope: OccurrenceDeleteScope) => Promise<void>;
  toggleOccurrenceComplete: (occurrence: Occurrence) => Promise<void>;
  setDailyReminderEnabled: (enabled: boolean) => Promise<void>;
  dismissDailyBanner: () => void;
  resetDailyBanner: () => void;
  /** The occurrence whose scheduled time has just arrived, if any — drives the auto-popup timer. Recurrence-aware: keyed by occurrenceId so each day's occurrence of a recurring series gets its own turn, not just the series' very first day. */
  dueOccurrence: Occurrence | null;
  dismissDueTask: () => void;
};

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyReminderEnabled, setDailyReminderEnabledState] = useState(true);
  const [showDailyBanner, setShowDailyBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dueOccurrence, setDueOccurrence] = useState<Occurrence | null>(null);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [rawTasks, rawReminder, rawShownDate, rawNotified] = await Promise.all([
          AsyncStorage.getItem(TASKS_KEY),
          AsyncStorage.getItem(REMINDER_KEY),
          AsyncStorage.getItem(REMINDER_SHOWN_KEY),
          AsyncStorage.getItem(NOTIFIED_KEY),
        ]);
        if (rawTasks) setTasks(JSON.parse(rawTasks));
        const enabled = rawReminder !== "false";
        setDailyReminderEnabledState(enabled);
        if (rawNotified) notifiedIdsRef.current = new Set(JSON.parse(rawNotified));

        // Show banner if reminder is enabled and hasn't been shown today
        const today = localDateISO();
        if (enabled && rawShownDate !== today) {
          setShowDailyBanner(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Poll for the occurrence (one-off task or a recurring series' occurrence
  // on today's date) whose scheduled time has just arrived, and pop up the
  // timer for it. Expanded via getOccurrencesForRange rather than iterating
  // raw `tasks` directly: a recurring series' base record only carries its
  // *original* startsOn date/time, so checking `t.date`/`t.time` against
  // "now" would only ever have a chance to fire on the series' very first
  // day. notifiedIdsRef is keyed by occurrenceId (`${seriesId}:${date}` for
  // a recurring occurrence, the task's own id for a one-off) rather than
  // task id, so each day's occurrence of a recurring series gets notified
  // independently instead of being permanently silenced after the first one.
  useEffect(() => {
    function checkDue() {
      setDueOccurrence((current) => {
        if (current) return current; // one popup at a time — wait for it to be dismissed
        const now = Date.now();
        const today = localDateISO();
        const todaysOccurrences = getOccurrencesForRange({ tasks, rangeStart: today, rangeEnd: today });
        for (const occ of todaysOccurrences) {
          if (occ.completed || notifiedIdsRef.current.has(occ.occurrenceId)) continue;
          const parsedTime = parseTimeString(occ.time);
          if (!parsedTime) continue; // malformed legacy task — never eligible to pop up
          const dt = parseLocalISO(occ.date);
          dt.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
          const diff = now - dt.getTime();
          if (diff >= 0 && diff <= DUE_WINDOW_MS) {
            notifiedIdsRef.current.add(occ.occurrenceId);
            // Prune ids belonging to tasks/series that no longer exist at
            // all (deleted since), so this can't grow forever — but keep
            // every other still-valid occurrenceId, including past days',
            // since a recurring series reuses the same seriesId every day.
            const validTaskIds = new Set(tasks.map((t) => t.id));
            const validSeriesIds = new Set(tasks.filter((t) => t.seriesId).map((t) => t.seriesId as string));
            const pruned = [...notifiedIdsRef.current].filter((id) => {
              const prefix = id.split(":")[0];
              return validTaskIds.has(prefix) || validSeriesIds.has(prefix);
            });
            notifiedIdsRef.current = new Set(pruned);
            AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(pruned));
            return occ;
          }
        }
        return current;
      });
    }
    checkDue();
    const interval = setInterval(checkDue, DUE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tasks]);

  const dismissDueTask = useCallback(() => {
    setDueOccurrence(null);
  }, []);

  const persistTasks = useCallback(async (updated: Task[]) => {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }, []);

  const addTask = useCallback(
    async (task: Omit<Task, "id" | "createdAt">): Promise<TaskSaveResult> => {
      const invalidReason = validateTaskFields(task);
      if (invalidReason) return { ok: false, reason: "invalid", message: invalidReason };
      if (isPastDateTime(task.date, task.time)) return { ok: false, reason: "past" };

      const conflict = findOverlap(tasks, task);
      if (conflict) return { ok: false, reason: "conflict", conflict };

      const id = Date.now().toString();
      const newTask: Task = {
        ...task,
        id,
        createdAt: new Date().toISOString(),
        // A brand-new recurring series' seriesId is just its own base
        // record's id — callers never need to invent one up front (they
        // don't know the id until now). Only self-assigns when the caller
        // didn't already provide one (e.g. never overrides the id
        // applyOccurrenceEdit's "following" split deliberately sets).
        ...(task.recurrence && !task.seriesId ? { seriesId: id } : null),
      };
      await persistTasks([...tasks, newTask]);
      return { ok: true };
    },
    [tasks, persistTasks]
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>): Promise<TaskSaveResult> => {
      const current = tasks.find((t) => t.id === id);
      const merged = current ? { ...current, ...updates } : updates;

      const invalidReason = validateTaskFields(merged as Task);
      if (invalidReason) return { ok: false, reason: "invalid", message: invalidReason };

      // Only re-validate against "now" if the date/time actually moved — otherwise
      // an already-past task could never have its title/duration edited again.
      const dateOrTimeChanged =
        !current || updates.date !== undefined && updates.date !== current.date ||
        updates.time !== undefined && updates.time !== current.time;
      if (dateOrTimeChanged && isPastDateTime((merged as Task).date, (merged as Task).time)) {
        return { ok: false, reason: "past" };
      }

      const conflict = findOverlap(tasks, merged as Task, id);
      if (conflict) return { ok: false, reason: "conflict", conflict };

      await persistTasks(tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)));
      return { ok: true };
    },
    [tasks, persistTasks]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await persistTasks(tasks.filter((t) => t.id !== id));
    },
    [tasks, persistTasks]
  );

  const toggleComplete = useCallback(
    async (id: string) => {
      await persistTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
    },
    [tasks, persistTasks]
  );

  const editOccurrence = useCallback(
    async (occurrence: Occurrence, scope: OccurrenceEditScope, fields: OccurrenceFieldEdits, newRule?: RecurrenceRule | null): Promise<TaskSaveResult> => {
      const invalidReason = validateTaskFields({ date: occurrence.date, time: fields.time, duration: fields.duration });
      if (invalidReason) return { ok: false, reason: "invalid", message: invalidReason };

      // Past-time only means something relative to the specific occurrence
      // date being split off ("this"/"following") — a series edited with
      // "all" keeps whatever startsOn/history it already had; that's not a
      // new date being scheduled, so there's nothing to reject as "past".
      if (scope !== "all" && isPastDateTime(occurrence.date, fields.time)) {
        return { ok: false, reason: "past" };
      }

      // Overlap checking only extends to the "this" scope, which is the only
      // one that produces a real one-off Task comparable via the existing
      // same-day findOverlap. Checking a whole recurring series (or its
      // "following" successor) against every other occurrence of every other
      // series across the calendar is a materially bigger feature — see
      // recurrenceService.ts's own doc comment — so it's deliberately out of
      // scope here rather than silently doing it wrong.
      if (scope === "this") {
        const conflict = findOverlap(
          tasks.filter((t) => t.id !== occurrence.task.id),
          { date: occurrence.date, time: fields.time, duration: fields.duration }
        );
        if (conflict) return { ok: false, reason: "conflict", conflict };
      }

      const updated = applyOccurrenceEdit(tasks, occurrence, scope, fields, () => Date.now().toString(), newRule);
      await persistTasks(updated);
      return { ok: true };
    },
    [tasks, persistTasks]
  );

  const deleteOccurrence = useCallback(
    async (occurrence: Occurrence, scope: OccurrenceDeleteScope) => {
      await persistTasks(applyOccurrenceDelete(tasks, occurrence, scope));
    },
    [tasks, persistTasks]
  );

  const toggleOccurrenceComplete = useCallback(
    async (occurrence: Occurrence) => {
      const seriesId = occurrence.task.seriesId ?? occurrence.task.id;
      const updated = tasks.map((t) => {
        if ((t.seriesId ?? t.id) !== seriesId) return t;
        const completions = t.completions ?? [];
        const alreadyDone = completions.some((c) => c.occurrenceDate === occurrence.date);
        const nextCompletions = alreadyDone
          ? completions.filter((c) => c.occurrenceDate !== occurrence.date)
          : [...completions, { occurrenceDate: occurrence.date, completedAt: new Date().toISOString() }];
        return { ...t, completions: nextCompletions };
      });
      await persistTasks(updated);
    },
    [tasks, persistTasks]
  );

  const setDailyReminderEnabled = useCallback(async (enabled: boolean) => {
    setDailyReminderEnabledState(enabled);
    await AsyncStorage.setItem(REMINDER_KEY, enabled ? "true" : "false");
    if (!enabled) setShowDailyBanner(false);
  }, []);

  const dismissDailyBanner = useCallback(() => {
    setShowDailyBanner(false);
    AsyncStorage.setItem(REMINDER_SHOWN_KEY, localDateISO());
  }, []);

  const resetDailyBanner = useCallback(() => {
    if (dailyReminderEnabled) setShowDailyBanner(true);
  }, [dailyReminderEnabled]);

  // Every other context in this app memoizes its provider value — this one
  // didn't, so a brand-new object was created on every TimeProvider render
  // regardless of whether anything it actually carries had changed. Combined
  // with the 15s due-task poll (checkDue, above) and any re-render cascading
  // down from a provider higher in the tree (Auth/Profile/Theme/...), this
  // forced every useTime() consumer — including the Planner's TaskModal/
  // TimeWheelPicker while a sheet is open and mid-drag — to re-render along
  // with it. Re-rendering that tree competes with the JS thread's own
  // touch/scroll handling (TimeWheelPicker's wheel has no Reanimated/UI-
  // thread path — it's a plain ScrollView), which is exactly the kind of
  // intermittent, hard-to-reproduce stutter/freeze this was producing.
  const value = useMemo<TimeContextType>(
    () => ({
      tasks,
      dailyReminderEnabled,
      showDailyBanner,
      isLoading,
      addTask,
      updateTask,
      deleteTask,
      toggleComplete,
      editOccurrence,
      deleteOccurrence,
      toggleOccurrenceComplete,
      setDailyReminderEnabled,
      dismissDailyBanner,
      resetDailyBanner,
      dueOccurrence,
      dismissDueTask,
    }),
    [
      tasks,
      dailyReminderEnabled,
      showDailyBanner,
      isLoading,
      addTask,
      updateTask,
      deleteTask,
      toggleComplete,
      editOccurrence,
      deleteOccurrence,
      toggleOccurrenceComplete,
      setDailyReminderEnabled,
      dismissDailyBanner,
      resetDailyBanner,
      dueOccurrence,
      dismissDueTask,
    ]
  );

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

export function useTime() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTime must be used inside TimeProvider");
  return ctx;
}
