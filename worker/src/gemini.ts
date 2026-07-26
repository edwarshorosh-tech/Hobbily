/**
 * gemini — the only place this Worker talks to the Gemini API.
 *
 * Plain `fetch` against the public REST endpoint (same style as auth.ts's
 * Identity Toolkit call) rather than the `@google/generative-ai` SDK — one
 * fewer dependency to vet for the Workers runtime, and this is a single
 * simple POST. GEMINI_API_KEY is a Cloudflare secret (see wrangler.toml);
 * it is never sent to or visible from the Expo client.
 *
 * Free-tier model, as requested — never silently upgraded to a paid model.
 */
import { WorkerError } from "./errors";
import { ADD_ACTIVITY_TOOL_NAME, DELETE_TASK_TOOL_NAME, RawToolArgs, RawDeleteArgs, buildTools } from "./prompt";

const MODEL = "gemini-3.1-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type ChatTurn = { role: "user" | "model"; text: string };

export type GeminiReply =
  | { kind: "message"; text: string }
  | { kind: "add_activity"; text: string; args: RawToolArgs }
  | { kind: "delete_task"; text: string; args: RawDeleteArgs };

type GeminiPart = { text?: string; functionCall?: { name?: string; args?: unknown } };
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export async function runChatTurn(
  apiKey: string,
  systemInstruction: string,
  history: ChatTurn[]
): Promise<GeminiReply> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        tools: buildTools(),
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    });
  } catch {
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable. Please try again in a moment.");
  }

  if (!res.ok) {
    // --- DEBUG LOGGING ADDED HERE ---
    // This will print the exact Google error to your terminal so you can fix it
    const errorText = await res.text().catch(() => "No error body");
    console.error("🔥 GEMINI API REJECTED REQUEST:", res.status, errorText);
    
    // Covers an invalid/missing key, rate limiting (free tier has a low
    // requests-per-minute cap), and any other non-2xx — all surface as the
    // same controlled, user-safe error rather than leaking Google's own
    // error body to the client.
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable. Please try again in a moment.");
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!data) {
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable. Please try again in a moment.");
  }

  if (data.promptFeedback?.blockReason) {
    throw new WorkerError("invalid_result", "I can't help with that. Try rephrasing.");
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  if (parts.length === 0) {
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable. Please try again in a moment.");
  }

  const textParts = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  // A response can carry both text and a function call in the same turn —
  // the function call is what actually schedules/removes something, so it
  // wins; any accompanying text is kept as the reply shown alongside it.
  const call = parts.find(
    (p) => p.functionCall && (p.functionCall.name === ADD_ACTIVITY_TOOL_NAME || p.functionCall.name === DELETE_TASK_TOOL_NAME)
  );
  if (call?.functionCall) {
    if (call.functionCall.name === DELETE_TASK_TOOL_NAME) {
      return { kind: "delete_task", text: textParts, args: (call.functionCall.args ?? {}) as RawDeleteArgs };
    }
    return { kind: "add_activity", text: textParts, args: (call.functionCall.args ?? {}) as RawToolArgs };
  }

  if (!textParts) {
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable. Please try again in a moment.");
  }
  return { kind: "message", text: textParts };
}