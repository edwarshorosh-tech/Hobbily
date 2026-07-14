/**
 * TimeContext
 * Provides time management state: tasks, hobby sessions, and daily reminder toggle.
 * All data is persisted to AsyncStorage.
 */
import { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "../types/Task";

const TASKS_KEY = "@hobbily_tasks";
const REMINDER_KEY = "@hobbily_daily_reminder";
const REMINDER_SHOWN_KEY = "@hobbily_reminder_shown_date";

export type TaskSaveResult = { ok: true } | { ok: false; conflict: Task };

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Finds a same-day task whose [time, time+duration) range overlaps the candidate's, excluding excludeId (used when editing). */
function findOverlap(
  existing: Task[],
  candidate: { date: string; time: string; duration: number },
  excludeId?: string
): Task | null {
  const start = timeToMinutes(candidate.time);
  const end = start + candidate.duration;
  for (const t of existing) {
    if (t.id === excludeId || t.date !== candidate.date) continue;
    const tStart = timeToMinutes(t.time);
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
};

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyReminderEnabled, setDailyReminderEnabledState] = useState(true);
  const [showDailyBanner, setShowDailyBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rawTasks, rawReminder, rawShownDate] = await Promise.all([
          AsyncStorage.getItem(TASKS_KEY),
          AsyncStorage.getItem(REMINDER_KEY),
          AsyncStorage.getItem(REMINDER_SHOWN_KEY),
        ]);
        if (rawTasks) setTasks(JSON.parse(rawTasks));
        const enabled = rawReminder !== "false";
        setDailyReminderEnabledState(enabled);

        // Show banner if reminder is enabled and hasn't been shown today
        const today = new Date().toISOString().slice(0, 10);
        if (enabled && rawShownDate !== today) {
          setShowDailyBanner(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function persistTasks(updated: Task[]) {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }

  async function addTask(task: Omit<Task, "id" | "createdAt">): Promise<TaskSaveResult> {
    const conflict = findOverlap(tasks, task);
    if (conflict) return { ok: false, conflict };

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
    const conflict = findOverlap(tasks, merged as Task, id);
    if (conflict) return { ok: false, conflict };

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
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.setItem(REMINDER_SHOWN_KEY, today);
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
