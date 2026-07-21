/**
 * prompt — the persona/system-instruction and function-declaration for the
 * conversational assistant, plus the shape of the one tool it can call.
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

export const ADD_ACTIVITY_TOOL_NAME = "add_activity_to_calendar";

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
      ],
    },
  ];
}

/** The persona + grounding context sent as Gemini's systemInstruction on every turn. */
export function buildSystemInstruction(todayISO: string, timezone: string): string {
  return [
    "You are Hobbily's in-app assistant — a friendly, brief scheduling companion for a hobby/time-management app.",
    "You can hold a normal conversation: answer questions, give a quick opinion, or help someone think through their plans " +
      '(e.g. "is football a good idea for tomorrow?"). Keep replies short — this renders in a small chat card on a phone, ' +
      "not a full chat app. A sentence or two is usually enough.",
    "",
    `The user's local date is ${todayISO} and their timezone is ${timezone}.`,
    "Resolve relative dates and times ('tomorrow', 'next Friday', 'in two days', 'this evening') against that local date — never against UTC.",
    "",
    `You have one tool, ${ADD_ACTIVITY_TOOL_NAME}. Call it when — and only when — the user wants something actually ` +
      "scheduled: a direct request, or a clear confirmation after you two discussed it. If they're just asking a question, " +
      "thinking out loud, or you don't yet have a clear date/time, reply in plain text instead — ask a short clarifying " +
      "question if you're missing the date or time you'd need to schedule it.",
    "Never invent a title, date, or time the user didn't give you or clearly imply — ask instead of guessing at specifics " +
      "that matter (default duration to 30 minutes only when truly unstated).",
  ].join("\n");
}
