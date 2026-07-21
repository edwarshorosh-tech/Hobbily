/**
 * aiAssistantService
 * The only place the Expo client talks to the AI Assistant backend. Calls
 * the Cloudflare Worker (worker/) — never Gemini directly, and never carries
 * the Gemini API key. Authenticates with the current user's Firebase ID
 * token (short-lived, already available via the Auth SDK — no separate
 * credential to manage).
 *
 * The Worker is stateless — conversational memory lives here, as a plain
 * array the caller resends on every turn (see sendChatMessage). Callers pass
 * a returned "action" reply's ParsedActivity straight into the existing
 * TimeContext.addTask() — this file does not write to Firestore itself and
 * does not define a second activity model.
 */
import { isAxiosError } from "axios";
import { auth } from "../lib/firebase";
import { api } from "./api";
import { deviceTimeZone, localDateISO } from "../utils/dateUtils";

export type ParsedActivity = {
  title: string;
  type: "task" | "hobby";
  date: string;
  time: string;
  duration: number;
};

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; text: string };

export type ChatReply =
  | { kind: "message"; text: string }
  | { kind: "action"; text: string; activity: ParsedActivity };

export type AiAssistantServiceErrorCode =
  | "invalid-request"
  | "unauthenticated"
  | "invalid-result"
  | "service-unavailable"
  | "network-error"
  | "unknown";

export class AiAssistantServiceError extends Error {
  code: AiAssistantServiceErrorCode;
  constructor(code: AiAssistantServiceErrorCode, message: string) {
    super(message);
    this.name = "AiAssistantServiceError";
    this.code = code;
  }
}

type WorkerErrorCode = "invalid_request" | "unauthenticated" | "invalid_result" | "service_unavailable" | "unknown";

type WorkerResponse =
  | { ok: true; reply: ChatReply }
  | { ok: false; error: { code: WorkerErrorCode; message: string } };

const WORKER_CODE_MAP: Record<WorkerErrorCode, AiAssistantServiceErrorCode> = {
  invalid_request: "invalid-request",
  unauthenticated: "unauthenticated",
  invalid_result: "invalid-result",
  service_unavailable: "service-unavailable",
  unknown: "unknown",
};

const WORKER_URL = process.env.EXPO_PUBLIC_AI_WORKER_URL ?? "";

/** Lets callers check upfront (e.g. to show a persistent notice) instead of only finding out via a thrown error. */
export const isAiAssistantConfigured = Boolean(WORKER_URL);

/** User-facing copy for service error codes — never surface raw backend/Gemini error text. */
export function friendlyAiAssistantMessage(e: unknown): string {
  if (e instanceof AiAssistantServiceError) return e.message;
  return "Something went wrong. Please try again.";
}

/**
 * Sends the running conversation (oldest first, ending with the newest user
 * message) to the Worker and returns Gemini's reply — either a plain message
 * or a confirmed "add to calendar" action with a validated activity. The
 * Worker itself keeps no session state; this array *is* the assistant's
 * memory, so the caller must keep appending to and resending it turn to turn.
 */
export async function sendChatMessage(history: ChatMessage[]): Promise<ChatReply> {
  if (!WORKER_URL) {
    throw new AiAssistantServiceError(
      "service-unavailable",
      "The AI assistant isn't set up yet. Add activities manually for now."
    );
  }

  const user = auth.currentUser;
  if (!user) {
    throw new AiAssistantServiceError("unauthenticated", "Please sign in again.");
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new AiAssistantServiceError("unauthenticated", "Please sign in again.");
  }

  try {
    const res = await api.post<WorkerResponse>(
      WORKER_URL,
      {
        messages: history,
        idToken,
        timezone: deviceTimeZone(),
        todayISO: localDateISO(),
      },
      { timeout: 30000 }
    );

    if (res.data.ok) return res.data.reply;
    throw new AiAssistantServiceError(WORKER_CODE_MAP[res.data.error.code] ?? "unknown", res.data.error.message);
  } catch (e) {
    if (e instanceof AiAssistantServiceError) throw e;

    if (isAxiosError<WorkerResponse>(e) && e.response?.data && e.response.data.ok === false) {
      const { code, message } = e.response.data.error;
      throw new AiAssistantServiceError(WORKER_CODE_MAP[code] ?? "unknown", message);
    }
    throw new AiAssistantServiceError("network-error", "Network error — please check your connection and try again.");
  }
}
