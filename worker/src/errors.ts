/**
 * errors — typed Worker error, mirroring the app's existing service-error
 * pattern (FriendServiceError/AvatarServiceError: a `code` union + message).
 * `unauthenticated`/`invalid_result` never leak internal details —
 * `message` is always safe to show the user as-is.
 */
export type WorkerErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "invalid_result"
  | "service_unavailable"
  | "unknown";

const STATUS_BY_CODE: Record<WorkerErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  invalid_result: 502,
  service_unavailable: 503,
  unknown: 500,
};

export class WorkerError extends Error {
  code: WorkerErrorCode;
  status: number;

  constructor(code: WorkerErrorCode, message: string) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function errorResponse(e: unknown, extraHeaders: Record<string, string>): Response {
  const err = e instanceof WorkerError ? e : new WorkerError("unknown", "Something went wrong. Please try again.");
  return new Response(JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }), {
    status: err.status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
