/**
 * validation — the last line of defense before a Gemini tool call is handed
 * back to the client and written into Firestore via the existing addTask()
 * flow. Every field is re-checked against a strict shape; nothing from the
 * model is trusted as-is.
 */
import { RawToolArgs } from "./prompt";
import { WorkerError } from "./errors";

export type ValidatedActivity = {
  title: string;
  type: "task" | "hobby";
  date: string;
  time: string;
  duration: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_DURATION = 5;
const MAX_DURATION = 480;

export function validateActivity(raw: RawToolArgs, todayISO: string): ValidatedActivity {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 100) : "";
  if (!title) {
    throw new WorkerError("invalid_result", "Couldn't determine a title for that activity.");
  }

  const type: "task" | "hobby" = raw.type === "hobby" ? "hobby" : "task";

  if (typeof raw.date !== "string" || !DATE_RE.test(raw.date)) {
    throw new WorkerError("invalid_result", "Couldn't determine a valid date for that activity.");
  }
  if (raw.date < todayISO) {
    throw new WorkerError("invalid_result", "That falls in the past. Try a current or future date.");
  }

  if (typeof raw.time !== "string" || !TIME_RE.test(raw.time)) {
    throw new WorkerError("invalid_result", "Couldn't determine a valid time for that activity.");
  }

  const rawDuration = typeof raw.durationMinutes === "number" ? raw.durationMinutes : Number(raw.durationMinutes);
  const duration = Number.isFinite(rawDuration) ? Math.round(rawDuration) : 30;
  const clampedDuration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration));

  return { title, type, date: raw.date, time: raw.time, duration: clampedDuration };
}
