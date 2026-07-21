/**
 * index — Worker entry point.
 *
 * Expo app -> (this Worker) -> Gemini API (free tier) -> validated reply
 * (plain message, or a validated activity from the add-to-calendar tool
 * call) -> Expo app -> existing authenticated activity service
 * (TimeContext.addTask) -> Cloud Firestore.
 *
 * The client resends the running conversation on every turn (this Worker
 * keeps no session state of its own) — see services/aiAssistantService.ts.
 *
 * POST /chat  { messages, idToken, timezone, todayISO }
 *   -> { ok: true, reply: { kind: "message", text } }
 *   -> { ok: true, reply: { kind: "action", text, activity: {...} } }
 *   -> { ok: false, error: { code, message } }
 *
 * GEMINI_API_KEY is read from env — a Cloudflare secret, set via
 * `wrangler secret put GEMINI_API_KEY`. It is never present in this repository.
 */
import { verifyFirebaseIdToken } from "./auth";
import { runChatTurn, ChatTurn } from "./gemini";
import { buildSystemInstruction } from "./prompt";
import { validateActivity } from "./validation";
import { WorkerError, errorResponse } from "./errors";

export interface Env {
  /** Secret — set with `wrangler secret put GEMINI_API_KEY`. Never committed. */
  GEMINI_API_KEY: string;
  /** Public Firebase Web API key (already committed client-side in lib/firebase.ts) — not a credential. */
  FIREBASE_WEB_API_KEY: string;
  /** The Expo app's origin(s) allowed to call this Worker. */
  ALLOWED_ORIGIN: string;
}

type RawMessage = { role?: unknown; text?: unknown };
type RequestBody = {
  messages?: unknown;
  idToken?: unknown;
  timezone?: unknown;
  todayISO?: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 500;
/** Caps both request size/cost and the free tier's per-minute quota impact — a short scheduling chat never needs more. */
const MAX_MESSAGES = 16;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Validates the client-supplied conversation and converts it to Gemini's role vocabulary ("user"/"model"). */
function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new WorkerError("invalid_request", "Say something to the assistant first.");
  }
  if (raw.length > MAX_MESSAGES) {
    throw new WorkerError("invalid_request", "That conversation has gotten too long — start a new one.");
  }

  const history: ChatTurn[] = raw.map((entry) => {
    const m = entry as RawMessage;
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string" || !m.text.trim()) {
      throw new WorkerError("invalid_request", "Malformed conversation.");
    }
    if (m.text.length > MAX_TEXT_LENGTH) {
      throw new WorkerError("invalid_request", "That message is too long.");
    }
    return { role: m.role === "assistant" ? "model" : "user", text: m.text.trim() };
  });

  if (history[history.length - 1].role !== "user") {
    throw new WorkerError("invalid_request", "The last message must be from the user.");
  }
  return history;
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body) {
    throw new WorkerError("invalid_request", "Malformed request.");
  }
  if (typeof body.idToken !== "string" || !body.idToken) {
    throw new WorkerError("unauthenticated", "Please sign in again.");
  }

  const history = parseHistory(body.messages);

  const todayISO = typeof body.todayISO === "string" && DATE_RE.test(body.todayISO)
    ? body.todayISO
    : new Date().toISOString().slice(0, 10);
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone : "UTC";

  // Auth first — never spend a Gemini call on an unauthenticated request.
  await verifyFirebaseIdToken(body.idToken, env.FIREBASE_WEB_API_KEY);

  if (!env.GEMINI_API_KEY) {
    throw new WorkerError("service_unavailable", "The AI assistant is temporarily unavailable.");
  }

  const reply = await runChatTurn(env.GEMINI_API_KEY, buildSystemInstruction(todayISO, timezone), history);

  const responseBody =
    reply.kind === "message"
      ? { ok: true, reply: { kind: "message", text: reply.text } }
      : { ok: true, reply: { kind: "action", text: reply.text, activity: validateActivity(reply.args, todayISO) } };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/chat") {
      return errorResponse(new WorkerError("invalid_request", "Not found."), headers);
    }

    try {
      const response = await handleChat(request, env);
      const mergedHeaders = new Headers(response.headers);
      Object.entries(headers).forEach(([k, v]) => mergedHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: mergedHeaders });
    } catch (e) {
      return errorResponse(e, headers);
    }
  },
};
