/**
 * index — Worker entry point.
 *
 * Expo app -> (this Worker) -> Gemini API (free tier) -> validated reply
 * (plain message, a validated activity from the add-to-calendar tool call,
 * or a validated taskId from the delete-task tool call) -> Expo app ->
 * existing authenticated TimeContext.addTask()/deleteTask() — no second
 * activity model, no direct AsyncStorage write here.
 *
 * The client resends the running conversation *and* its current task list
 * on every turn (this Worker keeps no session state of its own) — the task
 * list is grounding context only (see prompt.ts's formatSchedule), letting
 * Gemini resolve "cancel my soccer practice" to a real id instead of
 * inventing one. See services/aiAssistantService.ts.
 *
 * POST /chat  { messages, idToken, timezone, todayISO, tasks }
 *   -> { ok: true, reply: { kind: "message", text } }
 *   -> { ok: true, reply: { kind: "add_activity", text, activity: {...} } }
 *   -> { ok: true, reply: { kind: "delete_task", text, taskId } }
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
import { buildSystemInstruction, PromptTask } from "./prompt";
import { validateActivity, validateDeleteArgs } from "./validation";
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
  tasks?: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TEXT_LENGTH = 500;
/** Caps both request size/cost and the free tier's per-minute quota impact — a short scheduling chat never needs more. */
const MAX_MESSAGES = 16;
/** Caps the schedule grounding block's token cost — a hobby planner's list is never realistically bigger than this in practice. */
const MAX_TASKS = 60;

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

/**
 * Converts the client's raw task list into grounding context for the prompt
 * (see prompt.ts's formatSchedule/DELETE_TASK_TOOL_NAME). Unlike parseHistory
 * this never throws on a malformed entry — it's the client's own local
 * schedule, already validated once by TimeContext before it ever reached
 * AsyncStorage, so a stray bad entry here just gets silently skipped rather
 * than failing the whole chat turn over what would only ever be a client bug.
 */
function parseTasks(raw: unknown): PromptTask[] {
  if (!Array.isArray(raw)) return [];
  const result: PromptTask[] = [];
  for (const entry of raw) {
    if (result.length >= MAX_TASKS) break;
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.id !== "string" || !t.id) continue;
    if (typeof t.title !== "string" || !t.title.trim()) continue;
    if (t.type !== "task" && t.type !== "hobby") continue;
    if (typeof t.date !== "string" || !DATE_RE.test(t.date)) continue;
    if (typeof t.time !== "string" || !TIME_RE.test(t.time)) continue;
    const duration = typeof t.duration === "number" ? t.duration : Number(t.duration);
    if (!Number.isFinite(duration)) continue;
    result.push({
      id: t.id.slice(0, 100),
      title: t.title.trim().slice(0, 100),
      type: t.type,
      date: t.date,
      time: t.time,
      duration: Math.round(duration),
    });
  }
  return result;
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
  const tasks = parseTasks(body.tasks);

  const todayISO = typeof body.todayISO === "string" && DATE_RE.test(body.todayISO)
    ? body.todayISO
    : new Date().toISOString().slice(0, 10);
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone : "UTC";

  // Auth first — never spend a Gemini call on an unauthenticated request.
  await verifyFirebaseIdToken(body.idToken, env.FIREBASE_WEB_API_KEY);

  if (!env.GEMINI_API_KEY) {
    throw new WorkerError("service_unavailable", "Bubble is temporarily unavailable.");
  }

  const reply = await runChatTurn(env.GEMINI_API_KEY, buildSystemInstruction(todayISO, timezone, tasks), history);

  let responseBody: unknown;
  if (reply.kind === "message") {
    responseBody = { ok: true, reply: { kind: "message", text: reply.text } };
  } else if (reply.kind === "add_activity") {
    responseBody = { ok: true, reply: { kind: "add_activity", text: reply.text, activity: validateActivity(reply.args, todayISO) } };
  } else {
    // delete_task — taskId must match one of the ids this exact turn's
    // CURRENT SCHEDULE listed (see validateDeleteArgs); Gemini is never
    // trusted to have invented or correctly recalled one on its own.
    const knownTaskIds = new Set(tasks.map((t) => t.id));
    const { taskId } = validateDeleteArgs(reply.args, knownTaskIds);
    responseBody = { ok: true, reply: { kind: "delete_task", text: reply.text, taskId } };
  }

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
