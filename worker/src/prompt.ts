/**
 * prompt — the persona/system-instruction and function-declarations for the
 * conversational assistant, plus the shape of the two tools it can call.
 *
 * Kept separate from gemini.ts (the transport) so the persona/tool contract
 * can be read and edited on its own — gemini.ts just serializes whatever
 * this file builds into the Gemini request.
 */

/** Argument shape Gemini fills in when it calls add_activity_to_calendar. Not trusted as-is — validation.ts re-checks every field. */
export type RawToolArgs = {
  title?: unknown;
  type?: unknown;
  date?: unknown;
  time?: unknown;
  durationMinutes?: unknown;
};

/** Argument shape Gemini fills in when it calls delete_task. Not trusted as-is — validation.ts re-checks it against the task ids this same turn's CURRENT SCHEDULE actually listed. */
export type RawDeleteArgs = {
  taskId?: unknown;
};

/** One entry of the user's current schedule, embedded in the system instruction as grounding context so Gemini can resolve "cancel my soccer practice" to a real id instead of inventing one. */
export type PromptTask = {
  id: string;
  title: string;
  type: "task" | "hobby";
  date: string;
  time: string;
  duration: number;
};

export const ADD_ACTIVITY_TOOL_NAME = "add_activity_to_calendar";
export const DELETE_TASK_TOOL_NAME = "delete_task";

/**
 * Gemini's functionDeclarations schema uses upper-case JSON Schema type
 * names ("OBJECT"/"STRING"/"NUMBER"), not the lower-case ones from the
 * regular JSON Schema spec — this is Gemini-specific, not a typo.
 */
export function buildTools() {
  return [
    {
      functionDeclarations: [
        {
          name: ADD_ACTIVITY_TOOL_NAME,
          description:
            "Adds a single scheduled activity (a task or hobby session) to the user's calendar. " +
            "Only call this once the user actually wants something scheduled — either they asked directly " +
            "('schedule X at Y', 'add soccer practice tomorrow at 6pm'), or they confirmed after you discussed " +
            "it ('yes', 'ok add it', 'sounds good, do it'). Never call it just because an activity was mentioned " +
            "in passing or the user is still deciding.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Short activity title, e.g. 'Soccer practice'." },
              type: {
                type: "STRING",
                enum: ["task", "hobby"],
                description: "'hobby' for practice/creative/skill activities, 'task' for everything else.",
              },
              date: { type: "STRING", description: "YYYY-MM-DD. Must be today or a future date." },
              time: { type: "STRING", description: "24-hour HH:MM." },
              durationMinutes: {
                type: "NUMBER",
                description: "Estimated duration in minutes. Default to 30 if the user didn't say.",
              },
            },
            required: ["title", "type", "date", "time"],
          },
        },
        {
          name: DELETE_TASK_TOOL_NAME,
          description:
            "Removes, cancels, or deletes one existing scheduled task or hobby session/appointment from the " +
            "user's calendar. Only call this for an item that actually appears in the CURRENT SCHEDULE list given " +
            "to you, and only once the user clearly wants it gone — a direct request ('cancel my dentist " +
            "appointment', 'delete soccer practice', 'remove the 3pm task'), or a clear confirmation after you two " +
            "discussed removing something. Always pass the exact id from the CURRENT SCHEDULE list — never invent " +
            "or guess one. If more than one listed item could plausibly match what the user described, ask them to " +
            "clarify which one instead of guessing; if nothing in the list matches, say so in plain text instead " +
            "of calling this tool.",
          parameters: {
            type: "OBJECT",
            properties: {
              taskId: {
                type: "STRING",
                description: "The exact id of the task/appointment to remove, copied verbatim from the CURRENT SCHEDULE list.",
              },
            },
            required: ["taskId"],
          },
        },
      ],
    },
  ];
}

/** Compact grounding block listing the user's current schedule, so Gemini has real ids/titles/times to match delete requests (and avoid double-booking new ones) against. */
function formatSchedule(tasks: PromptTask[]): string {
  if (tasks.length === 0) {
    return "CURRENT SCHEDULE: (empty — nothing scheduled yet).";
  }
  const rows = tasks
    .map((t) => `- id=${t.id} | "${t.title}" | ${t.type} | ${t.date} ${t.time} | ${t.duration}min`)
    .join("\n");
  return `CURRENT SCHEDULE (id | title | type | date time | duration):\n${rows}`;
}

/** The persona + grounding context sent as Gemini's systemInstruction on every turn. */
export function buildSystemInstruction(todayISO: string, timezone: string, tasks: PromptTask[]): string {
  return [
    "You are Hobbily's in-app assistant, Bubble — a friendly, brief scheduling companion for a hobby/time-management app.",
    "You can hold a normal conversation: answer questions, give a quick opinion, or help someone think through their plans " +
      '(e.g. "is football a good idea for tomorrow?"). Keep replies short — this renders in a small chat card on a phone, ' +
      "not a full chat app. A sentence or two is usually enough.",
    "",
    `The user's local date is ${todayISO} and their timezone is ${timezone}.`,
    "Resolve relative dates and times ('tomorrow', 'next Friday', 'in two days', 'this evening') against that local date — never against UTC.",
    "",
    formatSchedule(tasks),
    "",
    `You have two tools. Use ${ADD_ACTIVITY_TOOL_NAME} when — and only when — the user wants something new actually ` +
      "scheduled: a direct request, or a clear confirmation after you two discussed it. " +
      `Use ${DELETE_TASK_TOOL_NAME} when — and only when — the user wants an existing item from the CURRENT SCHEDULE ` +
      "above removed, cancelled, or deleted. If they're just asking a question, thinking out loud, or you don't yet " +
      "have enough to act (a clear date/time to schedule, or a clear, unambiguous match to delete), reply in plain " +
      "text instead — ask a short clarifying question if something's missing.",
    "Never invent a title, date, time, or task id the user didn't give you or that isn't already in the CURRENT " +
      "SCHEDULE above — ask instead of guessing at specifics that matter (default duration to 30 minutes only when " +
      "truly unstated for a new activity).",
  ].join("\n");
}
