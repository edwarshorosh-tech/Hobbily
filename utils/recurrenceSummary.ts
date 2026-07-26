/**
 * Human-readable summary for a RecurrenceRule + start time, shown under the
 * Repeat settings in the Add/Edit Activity sheet — e.g. "Repeats every
 * weekday at 7:30 AM" or "Repeats every Monday, Wednesday and Friday at
 * 5:00 PM until October 31, 2026". Pure — takes everything it needs as
 * arguments, formats dates/lists via the runtime's own locale (same
 * `toLocaleDateString` pattern already used across app/(tabs)/time-manager.tsx)
 * rather than hardcoding English-only phrasing beyond the fixed connective words.
 */
import { RecurrenceRule } from "../types/Recurrence";
import { NormalizedTime, formatTime12h } from "./time";
import { parseLocalISO } from "./dateUtils";

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];
const WEEKEND_ONLY = [6, 7];

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** "Monday", "Monday and Wednesday", or "Monday, Wednesday and Friday" — Oxford-comma-free, matching common product copy style. */
function joinWeekdayNames(weekdays: number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b);
  const names = sorted.map((d) => WEEKDAY_NAMES[d - 1]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function formatUntilDate(untilISO: string): string {
  return parseLocalISO(untilISO).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

/** Describes only the "how often" part — no time, no "until" clause. Used both standalone (e.g. a compact chip label) and as a building block for summarizeRecurrence. */
export function describeFrequency(rule: RecurrenceRule): string {
  if (rule.type === "daily") return "every day";
  // type === "weekly"
  if (sameSet(rule.weekdays, ALL_DAYS)) return "every day";
  if (sameSet(rule.weekdays, WEEKDAYS_ONLY)) return "every weekday";
  if (sameSet(rule.weekdays, WEEKEND_ONLY)) return "every weekend";
  if (rule.weekdays.length === 0) return "never"; // guarded against in the UI (Custom requires >=1 day) — never shown, but must not crash
  return `every ${joinWeekdayNames(rule.weekdays)}`;
}

/** Full sentence, e.g. "Repeats every weekday at 7:30 AM" or "Repeats every weekend until October 31, 2026". */
export function summarizeRecurrence(rule: RecurrenceRule, startTime: NormalizedTime): string {
  const frequency = describeFrequency(rule);
  const timeLabel = formatTime12h(startTime);
  const base = `Repeats ${frequency} at ${timeLabel}`;
  if (rule.ends === "on_date" && rule.until) {
    return `${base} until ${formatUntilDate(rule.until)}`;
  }
  return base;
}
