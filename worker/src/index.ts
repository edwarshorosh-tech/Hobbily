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
 * POST /moderate  { idToken, text }
 *   -> { ok: true, allowed: true }
 *   -> { ok: true, allowed: false, category, severity }
 *   -> { ok: false, error: { code, message } }
 *   Server-side mirror of the Expo app's client-side moderation pre-check
 *   (see ./moderation.ts's own doc comment) — a real, deployable check
 *   Firestore Security Rules can't do on their own, since they can only
 *   validate structure/size, never analyze text content.
 *
 * GEMINI_API_KEY is read from env — a Cloudflare secret, set via
 * `wrangler secret put GEMINI_API_KEY`. It is never present in this repository.
 */
import { verifyFirebaseIdToken } from "./auth";
import { runChatTurn, ChatTurn } from "./gemini";
import { buildSystemInstruction } from "./prompt";
import { validateActivity } from "./validation";
import { WorkerError, errorResponse } from "./errors";
import { checkModerationText } from "./moderation";

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

/** Real free-text field length limit — same order of magnitude as the app's own largest field cap (post body, 1000 chars client-side / 5000 firestore.rules) with headroom; a longer request is rejected outright rather than silently truncated. */
const MAX_MODERATION_TEXT_LENGTH = 5000;

type ModerateRequestBody = { idToken?: unknown; text?: unknown };

async function handleModerate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as ModerateRequestBody | null;
  if (!body) throw new WorkerError("invalid_request", "Malformed request.");
  if (typeof body.idToken !== "string" || !body.idToken) {
    throw new WorkerError("unauthenticated", "Please sign in again.");
  }
  if (typeof body.text !== "string") {
    throw new WorkerError("invalid_request", "Missing text.");
  }
  if (body.text.length > MAX_MODERATION_TEXT_LENGTH) {
    throw new WorkerError("invalid_request", "Text is too long.");
  }

  // Auth first — this endpoint must never become an unauthenticated free
  // text-analysis oracle for someone outside the app.
  await verifyFirebaseIdToken(body.idToken, env.FIREBASE_WEB_API_KEY);

  const result = checkModerationText(body.text);
  return new Response(JSON.stringify({ ok: true, ...result }), {
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
    if (request.method !== "POST" || (pathname !== "/chat" && pathname !== "/moderate")) {
      return errorResponse(new WorkerError("invalid_request", "Not found."), headers);
    }

    try {
      const response = pathname === "/chat" ? await handleChat(request, env) : await handleModerate(request, env);
      const mergedHeaders = new Headers(response.headers);
      Object.entries(headers).forEach(([k, v]) => mergedHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: mergedHeaders });
    } catch (e) {
      return errorResponse(e, headers);
    }
  },
};
