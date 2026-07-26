/**
 * aiAssistantService
 * The only place the Expo client talks to the AI Assistant (Bubble) backend.
 * Calls the Cloudflare Worker (worker/) — never Gemini directly, and never
 * carries the Gemini API key. Authenticates with the current user's Firebase
 * ID token (short-lived, already available via the Auth SDK — no separate
 * credential to manage).
 *
 * The Worker is stateless — conversational memory lives here, as a plain
 * array the caller resends on every turn (see sendChatMessage). The caller
 * also resends its current task list on every turn — grounding context only
 * (never written by this file), letting the Worker's prompt resolve "cancel
 * my soccer practice" to a real id (see worker/src/prompt.ts's
 * formatSchedule). Callers pass a returned "add_activity" reply's
 * ParsedActivity into the existing TimeContext.addTask(), and a "delete_task"
 * reply's taskId into TimeContext.deleteTask() — this file does not write to
 * Firestore/AsyncStorage itself and does not define a second activity model.
 */
import { isAxiosError } from "axios";
import { auth } from "../lib/firebase";
import { api } from "./api";
import { deviceTimeZone, localDateISO } from "../utils/dateUtils";
import { Task } from "../types/Task";
import {
  AiAssistantServiceErrorCode,
  AiWorkerEndpointSummary,
  WORKER_CODE_MAP,
  WorkerErrorCode,
  describeAiWorkerEndpoint,
  isAiWorkerConfigured,
} from "../utils/aiAssistantConfig";

export type ParsedActivity = {
  title: string;
  type: "task" | "hobby";
  date: string;
  time: string;
  duration: number;
};

/** The lean subset of a Task actually needed as schedule grounding context — never the full stored record (completed/createdAt are irrelevant to the assistant). */
export type ScheduleTaskSummary = {
  id: string;
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
  | { kind: "add_activity"; text: string; activity: ParsedActivity }
  | { kind: "delete_task"; text: string; taskId: string };

export type { AiAssistantServiceErrorCode };

function toScheduleSummary(tasks: Task[]): ScheduleTaskSummary[] {
  return tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, date: t.date, time: t.time, duration: t.duration }));
}

export class AiAssistantServiceError extends Error {
  code: AiAssistantServiceErrorCode;
  constructor(code: AiAssistantServiceErrorCode, message: string) {
    super(message);
    this.name = "AiAssistantServiceError";
    this.code = code;
  }
}

type WorkerResponse =
  | { ok: true; reply: ChatReply }
  | { ok: false; error: { code: WorkerErrorCode; message: string } };

const WORKER_URL = process.env.EXPO_PUBLIC_AI_WORKER_URL ?? "";

/** Lets callers check upfront (e.g. to show a persistent notice) instead of only finding out via a thrown error. */
export const isAiAssistantConfigured = isAiWorkerConfigured(WORKER_URL);

/**
 * Development-only, secret-free diagnostics for comparing "why does AI work
 * on one machine and not another" across two computers on the same commit —
 * see .env.example for the required EXPO_PUBLIC_AI_WORKER_URL variable, and
 * utils/aiAssistantConfig.ts for why only the hostname (never the full URL,
 * a token, or any request content) is ever included here.
 */
export function getAiWorkerDiagnostics(): { configured: boolean; endpoint: AiWorkerEndpointSummary; hasAuthenticatedUser: boolean } {
  return {
    configured: isAiAssistantConfigured,
    endpoint: describeAiWorkerEndpoint(WORKER_URL),
    hasAuthenticatedUser: Boolean(auth.currentUser),
  };
}

/** User-facing copy for service error codes — never surface raw backend/Gemini error text. */
export function friendlyAiAssistantMessage(e: unknown): string {
  if (e instanceof AiAssistantServiceError) return e.message;
  return "Something went wrong. Please try again.";
}

/**
 * Sends the running conversation (oldest first, ending with the newest user
 * message) plus the user's current task list to the Worker and returns
 * Gemini's reply — a plain message, a confirmed "add to calendar" action
 * with a validated activity, or a confirmed "remove from calendar" action
 * with a validated taskId. The Worker itself keeps no session state; the
 * history array *is* the assistant's memory, so the caller must keep
 * appending to and resending it turn to turn — `tasks` is passed fresh every
 * call instead, since it's just the current schedule snapshot, not memory.
 */
export async function sendChatMessage(history: ChatMessage[], tasks: Task[]): Promise<ChatReply> {
  if (!WORKER_URL) {
    throw new AiAssistantServiceError(
      "service-unavailable",
      "Bubble isn't set up yet. Add activities manually for now."
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
        tasks: toScheduleSummary(tasks),
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
