/**
 * calendarParser — builds the extraction prompt sent to the model and parses
 * its raw text response back into structured JSON. Never trusts the model's
 * JSON as final — validation.ts re-checks every field before it's returned
 * to the client.
 */
import { WorkerError } from "./errors";

export type RawParsedActivity = {
  title?: unknown;
  type?: unknown;
  date?: unknown;
  time?: unknown;
  durationMinutes?: unknown;
};

export function buildPrompts(text: string, todayISO: string, timezone: string): { system: string; user: string } {
  const system = [
    "You are a calendar-parsing assistant for the Hobbily app.",
    "Convert the user's natural-language request into a single JSON object describing one activity to schedule.",
    "Respond with ONLY the JSON value — no explanation, no markdown code fences, no extra text.",
    "",
    `The user's local date is ${todayISO} and their timezone is ${timezone}.`,
    "Resolve relative dates and times ('tomorrow', 'next Friday', 'in two days', 'this evening') against that local date — never against UTC.",
    "",
    "When the request describes a real activity with enough information to schedule it, respond with exactly this shape:",
    "{",
    '  "title": string,             // short activity title, e.g. "Soccer practice"',
    '  "type": "task" | "hobby",    // "hobby" for practice/creative/skill activities, "task" for everything else',
    '  "date": string,              // YYYY-MM-DD, must be today or a future date',
    '  "time": string,              // 24-hour HH:MM',
    '  "durationMinutes": number    // a reasonable estimate if not stated, default 30',
    "}",
    "",
    "If the request has no discernible date/time, or is not a schedulable activity (a greeting, a question, small talk), respond with exactly: null",
  ].join("\n");

  return { system, user: text };
}

/** Parses the model's raw text response, tolerating markdown code fences some models wrap JSON in. */
export function parseModelOutput(raw: string): RawParsedActivity | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  if (cleaned === "" || cleaned.toLowerCase() === "null") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new WorkerError(
      "invalid_result",
      "Couldn't understand that request. Try rephrasing with a clear date and time."
    );
  }

  if (parsed === null) return null;
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkerError(
      "invalid_result",
      "Couldn't understand that request. Try rephrasing with a clear date and time."
    );
  }
  return parsed as RawParsedActivity;
}
