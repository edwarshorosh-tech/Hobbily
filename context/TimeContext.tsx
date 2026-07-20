/**
 * TimeContext
 * Provides time management state: tasks, hobby sessions, and daily reminder toggle.
 * All data is persisted to AsyncStorage.
 */
import { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "../types/Task";
import { localDateISO, isValidDateISO, parseLocalISO } from "../utils/dateUtils";
import { isDateTimeInPast, parseTimeString, timeStringToMinutes } from "../utils/time";
import { isValidDurationMinutes } from "../utils/duration";

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
  setDailyReminderEnabled: (enabled: boolean) => Promise<void>;
  dismissDailyBanner: () => void;
  resetDailyBanner: () => void;
  /** The task whose scheduled time has just arrived, if any — drives the auto-popup timer. */
  dueTask: Task | null;
  dismissDueTask: () => void;
};

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyReminderEnabled, setDailyReminderEnabledState] = useState(true);
  const [showDailyBanner, setShowDailyBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dueTask, setDueTask] = useState<Task | null>(null);
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

  // Poll for tasks whose scheduled time has just arrived and pop up the timer for them.
  useEffect(() => {
    function checkDue() {
      setDueTask((current) => {
        if (current) return current; // one popup at a time — wait for it to be dismissed
        const now = Date.now();
        for (const t of tasks) {
          if (t.completed || notifiedIdsRef.current.has(t.id)) continue;
          const parsedTime = parseTimeString(t.time);
          if (!isValidDateISO(t.date) || !parsedTime) continue; // malformed legacy task — never eligible to pop up
          const dt = parseLocalISO(t.date);
          dt.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
          const diff = now - dt.getTime();
          if (diff >= 0 && diff <= DUE_WINDOW_MS) {
            notifiedIdsRef.current.add(t.id);
            const validIds = new Set(tasks.map((x) => x.id));
            AsyncStorage.setItem(
              NOTIFIED_KEY,
              JSON.stringify([...notifiedIdsRef.current].filter((id) => validIds.has(id)))
            );
            return t;
          }
        }
        return current;
      });
    }
    checkDue();
    const interval = setInterval(checkDue, DUE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tasks]);

  function dismissDueTask() {
    setDueTask(null);
  }

  async function persistTasks(updated: Task[]) {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }

  async function addTask(task: Omit<Task, "id" | "createdAt">): Promise<TaskSaveResult> {
    const invalidReason = validateTaskFields(task);
    if (invalidReason) return { ok: false, reason: "invalid", message: invalidReason };
    if (isPastDateTime(task.date, task.time)) return { ok: false, reason: "past" };

    const conflict = findOverlap(tasks, task);
    if (conflict) return { ok: false, reason: "conflict", conflict };

    const newTask: Task = {
      ...task,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    await persistTasks([...tasks, newTask]);
    return { ok: true };
  }

  async function updateTask(id: string, updates: Partial<Task>): Promise<TaskSaveResult> {
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
  }

  async function deleteTask(id: string) {
    await persistTasks(tasks.filter((t) => t.id !== id));
  }

  async function toggleComplete(id: string) {
    await persistTasks(
      tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }

  async function setDailyReminderEnabled(enabled: boolean) {
    setDailyReminderEnabledState(enabled);
    await AsyncStorage.setItem(REMINDER_KEY, enabled ? "true" : "false");
    if (!enabled) setShowDailyBanner(false);
  }

  function dismissDailyBanner() {
    setShowDailyBanner(false);
    AsyncStorage.setItem(REMINDER_SHOWN_KEY, localDateISO());
  }

  function resetDailyBanner() {
    if (dailyReminderEnabled) setShowDailyBanner(true);
  }

  return (
    <TimeContext.Provider
      value={{
        tasks,
        dailyReminderEnabled,
        showDailyBanner,
        isLoading,
        addTask,
        updateTask,
        deleteTask,
        toggleComplete,
        setDailyReminderEnabled,
        dismissDailyBanner,
        resetDailyBanner,
        dueTask,
        dismissDueTask,
      }}
    >
      {children}
    </TimeContext.Provider>
  );
}

export function useTime() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTime must be used inside TimeProvider");
  return ctx;
}
