/**
 * index — Worker entry point.
 *
 * Expo app -> (this Worker) -> Hugging Face Inference Providers ->
 * validated structured result -> Expo app -> existing authenticated
 * activity service (TimeContext.addTask) -> Cloud Firestore.
 *
 * POST /parse-activity  { text, idToken, timezone, todayISO }
 *   -> { ok: true, activity: { title, type, date, time, duration } }
 *   -> { ok: false, error: { code, message } }
 *
 * HF_TOKEN is read from env — a Cloudflare secret, set via
 * `wrangler secret put HF_TOKEN`. It is never present in this repository.
 */
import { verifyFirebaseIdToken } from "./auth";
import { runCalendarInference } from "./huggingFace";
import { buildPrompts, parseModelOutput } from "./calendarParser";
import { validateActivity } from "./validation";
import { WorkerError, errorResponse } from "./errors";

export interface Env {
  /** Secret — set with `wrangler secret put HF_TOKEN`. Never committed. */
  HF_TOKEN: string;
  /** Public Firebase Web API key (already committed client-side in lib/firebase.ts) — not a credential. */
  FIREBASE_WEB_API_KEY: string;
  /** The Expo app's origin(s) allowed to call this Worker. */
  ALLOWED_ORIGIN: string;
}

type RequestBody = {
  text?: unknown;
  idToken?: unknown;
  timezone?: unknown;
  todayISO?: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 500;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function handleParseActivity(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    throw new WorkerError("invalid_request", "Please describe an activity to schedule.");
  }
  if (body.text.length > MAX_TEXT_LENGTH) {
    throw new WorkerError("invalid_request", "That request is too long.");
  }
  if (typeof body.idToken !== "string" || !body.idToken) {
    throw new WorkerError("unauthenticated", "Please sign in again.");
  }

  const todayISO = typeof body.todayISO === "string" && DATE_RE.test(body.todayISO)
    ? body.todayISO
    : new Date().toISOString().slice(0, 10);
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone : "UTC";

  // Auth first — never spend a Hugging Face call on an unauthenticated request.
  await verifyFirebaseIdToken(body.idToken, env.FIREBASE_WEB_API_KEY);

  if (!env.HF_TOKEN) {
    throw new WorkerError("service_unavailable", "The AI assistant is temporarily unavailable.");
  }

  const { system, user } = buildPrompts(body.text.trim(), todayISO, timezone);
  const raw = await runCalendarInference(env.HF_TOKEN, system, user);
  const parsed = parseModelOutput(raw);
  const activity = validateActivity(parsed, todayISO);

  return new Response(JSON.stringify({ ok: true, activity }), {
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
    if (request.method !== "POST" || pathname !== "/parse-activity") {
      return errorResponse(new WorkerError("invalid_request", "Not found."), headers);
    }

    try {
      const response = await handleParseActivity(request, env);
      const mergedHeaders = new Headers(response.headers);
      Object.entries(headers).forEach(([k, v]) => mergedHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: mergedHeaders });
    } catch (e) {
      return errorResponse(e, headers);
    }
  },
};
