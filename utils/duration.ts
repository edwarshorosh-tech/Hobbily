/**
 * utils/duration.ts
 *
 * Canonical duration model for Hobbily: a plain number of minutes
 * (Task.duration already stores this — no competing "30m"/"1h 30m" string
 * format is introduced). Shared here so the Planner duration slider, Home,
 * and any legacy-string normalization all agree on one set of rules.
 */

/** Bounds enforced by the Planner's duration slider (Add/Edit Activity). */
export const SLIDER_MIN_MINUTES = 5;
export const SLIDER_MAX_MINUTES = 240;
export const SLIDER_STEP_MINUTES = 5;
export const DEFAULT_DURATION_MINUTES = 30;

type DurationBounds = { min?: number; max?: number };

/**
 * True only for a finite positive integer number of minutes within
 * [min, max] (defaults to the slider's own bounds). Rejects undefined,
 * null, NaN, Infinity, 0, negative numbers, and non-integers. Never throws.
 */
export function isValidDurationMinutes(
  value: unknown,
  { min = SLIDER_MIN_MINUTES, max = SLIDER_MAX_MINUTES }: DurationBounds = {}
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/** Clamps a duration to the nearest valid slider step within bounds. */
export function clampDurationToStep(
  minutes: number,
  { min = SLIDER_MIN_MINUTES, max = SLIDER_MAX_MINUTES }: DurationBounds = {},
  step: number = SLIDER_STEP_MINUTES
): number {
  const clamped = Math.min(max, Math.max(min, minutes));
  return Math.round(clamped / step) * step;
}

/**
 * Best-effort parse of a legacy free-text duration ("30m", "30 minutes",
 * "1h 30m", "1 hour") into a whole number of minutes. Only supports formats
 * that could realistically already exist from earlier text-input duration
 * fields in this app — not speculative formats. Returns null (never throws)
 * for anything it can't confidently parse; callers must still validate the
 * result with isValidDurationMinutes before trusting it.
 */
export function parseLegacyDurationString(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const hoursMinutes = /^(\d+)\s*h(?:r|our)?s?\s*(?:(\d+)\s*m(?:in)?(?:ute)?s?)?$/.exec(trimmed);
  if (hoursMinutes) {
    const hours = Number(hoursMinutes[1]);
    const minutes = hoursMinutes[2] ? Number(hoursMinutes[2]) : 0;
    return hours * 60 + minutes;
  }

  const minutesOnly = /^(\d+)\s*m(?:in)?(?:ute)?s?$/.exec(trimmed);
  if (minutesOnly) return Number(minutesOnly[1]);

  return null;
}

/** Displays a duration for humans: "5 min", "45 min", "1 hr", "1 hr 15 min", "2 hr". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 60) {
    return `${Math.max(0, Math.round(minutes))} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  const hourLabel = `${hours} hr`;
  return remainder === 0 ? hourLabel : `${hourLabel} ${remainder} min`;
}
