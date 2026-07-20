/**
 * Home screen "AI Assistant" — a local, rule-based text interpreter (no network
 * call). It understands three kinds of message:
 *   1. A scheduling request ("Soccer practice next Tuesday at 7pm")
 *   2. A free-time question ("when am I free tomorrow?")
 *   3. An exam/test mention ("I have a biology exam on July 20th"), which also
 *      plans a few study sessions in the free time leading up to it.
 * All date/time parsing and free-slot math lives here so app/(tabs)/index.tsx
 * only has to dispatch on `action.kind` and persist via TimeContext.
 */
import { Task } from "../types/Task";
import { addDaysISO, parseLocalISO } from "../utils/dateUtils";
import { formatTimeString, isValidHour, isValidMinute, parseTimeString, timeStringToMinutes } from "../utils/time";

// ── Date/time vocabulary ─────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const MONTH_ALIASES: Record<string, number> = {};
MONTH_NAMES.forEach((name, i) => {
  MONTH_ALIASES[name] = i;
  MONTH_ALIASES[name.slice(0, 3)] = i;
});
MONTH_ALIASES["sept"] = 8;
// Longest alias first so "september" is tried before the "sep" it starts with.
const MONTH_PATTERN = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length).join("|");

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Current wall-clock time as "HH:MM", used as the guessed time when the user doesn't say one. */
function currentTimeHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:MM" (24h) -> "h:mm AM/PM" for user-facing messages. Falls back to the raw value if it's ever passed something that isn't a valid canonical time — this module only ever produces already-validated times, but callers pass values right back through it, so it stays defensive. */
export function formatTimeAMPM(time: string): string {
  const parsed = parseTimeString(time);
  if (!parsed) return time;
  const ampm = parsed.hour >= 12 ? "PM" : "AM";
  const hour = parsed.hour % 12 || 12;
  return `${hour}:${pad(parsed.minute)} ${ampm}`;
}

function toISODate(year: number, monthIdx: number, day: number): string {
  return `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Timezone-proof date arithmetic ───────────────────────────────────────────
// Every "date" here is a plain YYYY-MM-DD calendar day, never a Date wall-clock
// instant. Adding/subtracting days goes through the app's canonical
// utils/dateUtils.ts `addDaysISO` instead of a local copy. `isoToEpochDay`
// remains here only for numeric day-difference/ordering comparisons (e.g.
// "is this date before today", "how many days until the exam") that
// dateUtils.ts has no exported equivalent for — it goes through Date.UTC so
// the runtime's local timezone can never shift a computed day by one.

function isoToEpochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** 0=Sunday..6=Saturday for a calendar date, independent of local timezone. */
function weekdayOfISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Runs `re` against the lowercased text (so alias/weekday lookups in capture
 * groups are simple lowercase keys) but returns `match` sliced from the
 * original-cased text at the same position — otherwise a later
 * `text.replace(match, "")` silently no-ops whenever the user capitalized
 * anything (e.g. "July" vs the pattern's lowercase "july").
 */
function matchOriginalCase(text: string, lower: string, re: RegExp): RegExpMatchArray | null {
  const m = lower.match(re);
  if (!m || m.index === undefined) return null;
  const copy = m.slice() as RegExpMatchArray;
  copy[0] = text.slice(m.index, m.index + m[0].length);
  return copy;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

/**
 * Understands ISO dates, "Month Day[, Year]" and "Day Month" (with abbreviations),
 * numeric M/D[/Y], and relative phrasing (today, tomorrow, day after tomorrow,
 * "in N days/weeks", weekday names with an optional "next"/"this").
 */
function extractDate(text: string, todayISODate: string): { date: string; match: string } | null {
  const lower = text.toLowerCase();
  const todayEpoch = isoToEpochDay(todayISODate);

  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return { date: toISODate(+m[1], +m[2] - 1, +m[3]), match: m[0] };

  let om = matchOriginalCase(text, lower, new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`));
  if (om) {
    const monthIdx = MONTH_ALIASES[om[1]];
    const day = parseInt(om[2], 10);
    let year = om[3] ? parseInt(om[3], 10) : new Date(todayEpoch * 86400000).getUTCFullYear();
    if (!om[3] && isoToEpochDay(toISODate(year, monthIdx, day)) < todayEpoch) year += 1;
    return { date: toISODate(year, monthIdx, day), match: om[0] };
  }

  om = matchOriginalCase(text, lower, new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})\\.?(?:,?\\s*(\\d{4}))?\\b`));
  if (om) {
    const day = parseInt(om[1], 10);
    const monthIdx = MONTH_ALIASES[om[2]];
    let year = om[3] ? parseInt(om[3], 10) : new Date(todayEpoch * 86400000).getUTCFullYear();
    if (!om[3] && isoToEpochDay(toISODate(year, monthIdx, day)) < todayEpoch) year += 1;
    return { date: toISODate(year, monthIdx, day), match: om[0] };
  }

  m = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : new Date(todayEpoch * 86400000).getUTCFullYear();
      if (!m[3] && isoToEpochDay(toISODate(year, month, day)) < todayEpoch) year += 1;
      return { date: toISODate(year, month, day), match: m[0] };
    }
  }

  om = matchOriginalCase(text, lower, /\bday after tomorrow\b/);
  if (om) return { date: addDaysISO(todayISODate, 2), match: om[0] };

  om = matchOriginalCase(text, lower, /\btomorrow\b/);
  if (om) return { date: addDaysISO(todayISODate, 1), match: om[0] };

  om = matchOriginalCase(text, lower, /\b(today|tonight)\b/);
  if (om) return { date: todayISODate, match: om[0] };

  om = matchOriginalCase(text, lower, /\bin\s+(a|an|\d+)\s+(day|days|week|weeks)\b/);
  if (om) {
    const n = om[1] === "a" || om[1] === "an" ? 1 : parseInt(om[1], 10);
    const unitDays = om[2].startsWith("week") ? 7 : 1;
    return { date: addDaysISO(todayISODate, n * unitDays), match: om[0] };
  }

  om = matchOriginalCase(text, lower, new RegExp(`\\b(?:next\\s+|this\\s+)?(${WEEKDAY_NAMES.join("|")})\\b`));
  if (om) {
    const targetDay = WEEKDAY_NAMES.indexOf(om[1]);
    let diff = (targetDay - weekdayOfISO(todayISODate) + 7) % 7;
    if (diff === 0) diff = 7; // same weekday as today reads as "next week's", not "later today"
    return { date: addDaysISO(todayISODate, diff), match: om[0] };
  }

  return null;
}

/**
 * Understands "noon"/"midnight", HH:MM (24h or with am/pm), bare "H am/pm",
 * and a bare "at H" guess. Every branch validates the result against the
 * canonical HH:mm model before returning it — a match like "90:00" or
 * "12:66" is a real regex hit but not a real time, so it's rejected here
 * rather than handed to addTask() unchecked (that used to be able to save
 * an out-of-range time straight from free-text AI input).
 */
function extractTime(text: string): { time: string; match: string } | null {
  const lower = text.toLowerCase();

  let om = matchOriginalCase(text, lower, /\b(noon|midnight)\b/);
  if (om) return { time: om[1] === "noon" ? "12:00" : "00:00", match: om[0] };

  let m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (isValidHour(h) && isValidMinute(minute)) {
      return { time: formatTimeString({ hour: h, minute }), match: m[0] };
    }
  }

  m = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const ampm = m[2].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (isValidHour(h)) return { time: formatTimeString({ hour: h, minute: 0 }), match: m[0] };
  }

  // No am/pm given — "at 7" reads as evening for a teen's after-school schedule.
  m = text.match(/\bat\s+(\d{1,2})\b/i);
  if (m) {
    let h = parseInt(m[1], 10);
    if (h >= 1 && h <= 7) h += 12;
    h = h % 24;
    if (isValidHour(h)) return { time: formatTimeString({ hour: h, minute: 0 }), match: m[0] };
  }

  return null;
}

function extractTitle(text: string, dateMatch: string, timeMatch: string): string {
  let title = text;
  if (dateMatch) title = title.replace(dateMatch, "");
  if (timeMatch) title = title.replace(timeMatch, "");
  title = title
    .replace(/^\s*(i\s*(have|'ve got|need|want to)|remind me to|schedule|please\s*(add|schedule)?|add)\s*/i, "")
    .replace(/\bon\b/gi, "")
    .replace(/\bat\b/gi, "")
    .replace(/[,.]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!title) title = "New Task";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Pulls the subject out of "biology exam" / "exam for chemistry" style phrasing, title-cased. */
function extractExamSubject(text: string, dateMatch: string, timeMatch: string, keyword: string): string {
  let s = text;
  if (dateMatch) s = s.replace(dateMatch, " ");
  if (timeMatch) s = s.replace(timeMatch, " ");
  s = s
    .replace(new RegExp(`\\b${keyword}s?\\b`, "gi"), " ")
    .replace(/\b(i\s*(have|'ve got|need|want to)|my|there'?s?|a|an|the|upcoming|big|important|coming|on|at|for|in|next)\b/gi, " ")
    .replace(/[,.]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!s) return "";
  return s.split(" ").map(capitalize).join(" ");
}

// ── Free-time math ────────────────────────────────────────────────────────────

const DAY_START = 8 * 60; // 08:00
const DAY_END = 22 * 60; // 22:00
const MIN_SLOT = 20; // ignore slivers shorter than this when reporting free time

function timeToMinutes(t: string): number {
  return timeStringToMinutes(t) ?? 0;
}

function minutesToClock24(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function formatClock12(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ampm}`;
}

function nowMinutesRoundedUp(): number {
  const now = new Date();
  return Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
}

/** Open windows on `date` within the 08:00–22:00 day, floored at `floorMinutes` (e.g. "now" for today). */
function freeSlotsForDate(date: string, tasks: Task[], floorMinutes: number): { start: number; end: number }[] {
  const dayTasks = tasks
    .filter((t) => t.date === date)
    .map((t) => ({ start: timeToMinutes(t.time), end: timeToMinutes(t.time) + t.duration }))
    .sort((a, b) => a.start - b.start);

  const slots: { start: number; end: number }[] = [];
  let cursor = Math.max(DAY_START, floorMinutes);
  for (const t of dayTasks) {
    if (t.start > cursor) slots.push({ start: cursor, end: Math.min(t.start, DAY_END) });
    cursor = Math.max(cursor, t.end);
  }
  if (cursor < DAY_END) slots.push({ start: cursor, end: DAY_END });
  return slots.filter((s) => s.end - s.start >= MIN_SLOT);
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeFreeTime(scope: "today" | "tomorrow" | "week", tasks: Task[], todayISODate: string): string {
  if (scope === "week") {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysISO(todayISODate, i);
      const floor = i === 0 ? nowMinutesRoundedUp() : DAY_START;
      const slots = freeSlotsForDate(date, tasks, floor);
      const minutesFree = slots.reduce((sum, s) => sum + (s.end - s.start), 0);
      const label = i === 0 ? "today" : i === 1 ? "tomorrow" : WEEKDAY_LABELS[weekdayOfISO(date)];
      return { label, minutesFree };
    });
    const ranked = [...days].sort((a, b) => b.minutesFree - a.minutesFree).filter((d) => d.minutesFree > 0);
    if (ranked.length === 0) return "You're fully booked all week — no open slots through next " + days[6].label + ".";
    const top = ranked.slice(0, 2).map((d) => `${d.label} (${(d.minutesFree / 60).toFixed(1)}h free)`);
    return `This week you've got the most open time on ${top.join(" and ")}.`;
  }

  const date = scope === "today" ? todayISODate : addDaysISO(todayISODate, 1);
  const floor = scope === "today" ? nowMinutesRoundedUp() : DAY_START;
  const slots = freeSlotsForDate(date, tasks, floor);
  const label = scope === "today" ? "today" : "tomorrow";
  if (slots.length === 0) return `You're fully booked ${label} — nothing open before 10 PM.`;
  const windows = slots.map((s) => `${formatClock12(s.start)}–${formatClock12(s.end)}`);
  return `You're free ${label}: ${windows.join(", ")}.`;
}

// ── Exam study planning ───────────────────────────────────────────────────────

const EXAM_STUDY_SESSIONS = 3;
const STUDY_DURATION = 45;

/** Places up to 3 study sessions on the days before the exam, each in that day's biggest free window. */
function planStudySessions(examDate: string, tasks: Task[], todayISODate: string): { date: string; time: string }[] {
  const leadDays = isoToEpochDay(examDate) - isoToEpochDay(todayISODate);
  if (leadDays <= 0) return [];

  const sessionsWanted = Math.min(EXAM_STUDY_SESSIONS, leadDays);
  const plan: { date: string; time: string }[] = [];

  // Walk backward from the day before the exam so prep clusters closest to test day.
  for (let i = 1; i <= leadDays && plan.length < sessionsWanted; i++) {
    const date = addDaysISO(examDate, -i);
    const floor = date === todayISODate ? nowMinutesRoundedUp() : DAY_START;
    const slots = freeSlotsForDate(date, tasks, floor).filter((s) => s.end - s.start >= STUDY_DURATION);
    if (slots.length > 0) {
      const best = slots.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
      plan.push({ date, time: minutesToClock24(best.start) });
    }
  }
  return plan;
}

// ── Public entry point ────────────────────────────────────────────────────────

export type AssistantAction =
  | { kind: "schedule"; title: string; date: string; time: string }
  | {
      kind: "exam";
      label: string; // e.g. "Biology Exam"
      subject: string; // e.g. "Biology" (may be "")
      date: string;
      time: string;
      timeWasGuessed: boolean;
      studySessions: { title: string; date: string; time: string; duration: number }[];
    }
  | { kind: "free_info"; message: string }
  | { kind: "unknown" };

/** Interprets one chat message against the current schedule. Pure — no side effects. */
export function interpretMessage(text: string, tasks: Task[], todayISODate: string): AssistantAction {
  const lower = text.toLowerCase();

  if (/\b(when\s+(am|are|is)\s+i\s+free|when\s+can\s+i|free\s*time|am\s+i\s+free)\b/.test(lower)) {
    const scope: "today" | "tomorrow" | "week" = /\btomorrow\b/.test(lower)
      ? "tomorrow"
      : /\b(week|weekly)\b/.test(lower)
      ? "week"
      : "today";
    return { kind: "free_info", message: describeFreeTime(scope, tasks, todayISODate) };
  }

  const dateResult = extractDate(text, todayISODate);
  const timeResult = extractTime(text);

  const examMatch = lower.match(/\b(exam|test|quiz)\b/);
  if (examMatch && dateResult) {
    const keyword = examMatch[1];
    const subject = extractExamSubject(text, dateResult.match, timeResult?.match ?? "", keyword);
    const label = subject ? `${subject} ${capitalize(keyword)}` : capitalize(keyword);
    const time = timeResult?.time ?? currentTimeHHMM();
    const studySessions = planStudySessions(dateResult.date, tasks, todayISODate).map((s) => ({
      title: `Study for ${subject || label}`,
      date: s.date,
      time: s.time,
      duration: STUDY_DURATION,
    }));
    return { kind: "exam", label, subject, date: dateResult.date, time, timeWasGuessed: !timeResult, studySessions };
  }

  if (dateResult && timeResult) {
    return {
      kind: "schedule",
      title: extractTitle(text, dateResult.match, timeResult.match),
      date: dateResult.date,
      time: timeResult.time,
    };
  }

  return { kind: "unknown" };
}

export function formatShortDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
