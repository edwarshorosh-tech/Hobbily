/**
 * utils/time.ts
 *
 * Canonical time model for Hobbily: a 24-hour "HH:mm" string (zero-padded,
 * hour 00-23, minute 00-59). This already matches Task.time (AsyncStorage,
 * context/TimeContext.tsx), the AI worker's ValidatedActivity.time
 * (worker/src/validation.ts), and every display format already in the app —
 * so it's kept as the one canonical shape rather than introducing a
 * competing Firestore-Timestamp or minutes-since-midnight model where none
 * is needed.
 *
 * Every place that reads, validates, or formats a task's time should go
 * through here instead of re-implementing `time.split(":").map(Number)`
 * (the exact pattern that let a malformed value reach `.toString()` on
 * `undefined` and crash Home — see formatTimeLabel below, which never
 * throws).
 */
import { localDateISO, parseLocalISO } from "./dateUtils";

export type NormalizedTime = { hour: number; minute: number };

export const MIN_HOUR = 0;
export const MAX_HOUR = 23;
export const MIN_MINUTE = 0;
export const MAX_MINUTE = 59;

/** Strict canonical shape: exactly 2-digit hour + 2-digit minute, zero-padded. */
const TIME_STRING_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_HOUR && value <= MAX_HOUR;
}

export function isValidMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_MINUTE && value <= MAX_MINUTE;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Strictly parses a canonical "HH:mm" (24h, zero-padded) string. Returns
 * null for anything else — undefined, null, "", " ", non-strings, partially
 * typed values ("9", "14"), and out-of-range values ("24:00", "12:66",
 * "90:00", "-1:30"). Never throws.
 */
export function parseTimeString(value: unknown): NormalizedTime | null {
  if (typeof value !== "string") return null;
  const match = TIME_STRING_RE.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!isValidHour(hour) || !isValidMinute(minute)) return null;
  return { hour, minute };
}

/** Formats a normalized time back into the canonical "HH:mm" string. */
export function formatTimeString(time: NormalizedTime): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

/** Converts minutes-since-midnight (0-1439) to a normalized time, or null if out of range/non-integer. */
export function minutesToNormalizedTime(totalMinutes: unknown): NormalizedTime | null {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes) || !Number.isInteger(totalMinutes)) {
    return null;
  }
  if (totalMinutes < 0 || totalMinutes > MAX_HOUR * 60 + MAX_MINUTE) return null;
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

/** Converts a normalized time to minutes-since-midnight (0-1439). */
export function normalizedTimeToMinutes(time: NormalizedTime): number {
  return time.hour * 60 + time.minute;
}

/** Parses a canonical "HH:mm" string straight to minutes-since-midnight, or null if invalid. */
export function timeStringToMinutes(value: unknown): number | null {
  const t = parseTimeString(value);
  return t ? normalizedTimeToMinutes(t) : null;
}

/** 12-hour display, e.g. {hour:14,minute:5} -> "2:05 PM". */
export function formatTime12h(time: NormalizedTime): string {
  const period = time.hour >= 12 ? "PM" : "AM";
  const hour12 = time.hour % 12 || 12;
  return `${hour12}:${pad2(time.minute)} ${period}`;
}

export type TimeFormatResult =
  | { ok: true; label: string }
  | { ok: false; label: "Time not set"; reason: string };

const warnedKeys = new Set<string>();

/**
 * Never throws. Validates `rawTime` — whatever shape a legacy or malformed
 * record actually carries — and returns a display-ready result. Invalid
 * input yields the "Time not set" fallback instead of crashing the caller.
 * Logs one dev-only warning per distinct (taskId, value) pair so a bad
 * record is visible without spamming every re-render; never includes
 * profile/user data, only the task id and the offending value.
 */
export function formatTimeLabel(rawTime: unknown, context?: { taskId?: string }): TimeFormatResult {
  const parsed = parseTimeString(rawTime);
  if (parsed) return { ok: true, label: formatTime12h(parsed) };

  if (__DEV__) {
    const rawDescription = typeof rawTime === "string" ? JSON.stringify(rawTime) : String(rawTime);
    const key = `${context?.taskId ?? "anon"}:${rawDescription}`;
    if (!warnedKeys.has(key)) {
      warnedKeys.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[formatTimeLabel] invalid "time" field${context?.taskId ? ` on task ${context.taskId}` : ""} — expected "HH:mm", got ${rawDescription}`
      );
    }
  }
  return { ok: false, label: "Time not set", reason: "invalid-time" };
}

/**
 * Small buffer so a value that was valid the instant the form opened doesn't
 * flip to "past" purely because the user spent a normal amount of time
 * filling out the rest of the form before saving.
 */
const PAST_TIME_GRACE_MS = 60_000;

/** True if `dateISO` + `time` (both must already be valid) is more than a short grace period earlier than `now`. Pure — takes `now` as a parameter and never reads any external mutable state, so it's safe to call on every render. */
export function isDateTimeInPast(dateISO: string, time: NormalizedTime, now: Date = new Date()): boolean {
  const dt = parseLocalISO(dateISO);
  dt.setHours(time.hour, time.minute, 0, 0);
  return dt.getTime() < now.getTime() - PAST_TIME_GRACE_MS;
}

/**
 * "Now + 1 minute", as a canonical {date, time} pair, computed fresh at call
 * time via real Date arithmetic (hour/day rollover handled natively by
 * Date#setMinutes) — never a stale value cached at module load.
 *
 * Examples: 14:25 -> {today, 14:26}; 23:59 -> {tomorrow, 00:00}.
 */
export function computeDefaultStart(now: Date = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  return { date: localDateISO(d), time: formatTimeString({ hour: d.getHours(), minute: d.getMinutes() }) };
}
