/**
 * Pure, Firebase-free helpers for the AI Assistant's client-side
 * configuration boundary — split out of services/aiAssistantService.ts so
 * they're independently unit-testable. That file can't be imported directly
 * in this project's Jest suite: it (transitively, via lib/firebase.ts) pulls
 * in `firebase/app`'s ESM build, which Jest's default transform can't parse
 * (see utils/friendRecommendations.ts for the same constraint on the friends
 * feature).
 *
 * The one thing that actually varies between "works on my machine" and
 * "isn't set up yet" is whether EXPO_PUBLIC_AI_WORKER_URL was present at
 * Metro bundle time — it's a local, gitignored .env value (see .env.example),
 * never committed, so a fresh clone genuinely has no way to know it's needed
 * without documentation. isAiWorkerConfigured/describeAiWorkerEndpoint below
 * are what a development-only diagnostics view should call — they never
 * return the full URL, only whether it's set and its hostname (a worker URL
 * is not a secret, but printing only the hostname still avoids leaking a
 * private/unlisted path segment or query string a deployment might use).
 */

export type WorkerErrorCode = "invalid_request" | "unauthenticated" | "invalid_result" | "service_unavailable" | "unknown";
export type AiAssistantServiceErrorCode = "invalid-request" | "unauthenticated" | "invalid-result" | "service-unavailable" | "network-error" | "unknown";

/** Maps the Worker's (worker/src/errors.ts) error code vocabulary onto the client's own — see services/aiAssistantService.ts. */
export const WORKER_CODE_MAP: Record<WorkerErrorCode, AiAssistantServiceErrorCode> = {
  invalid_request: "invalid-request",
  unauthenticated: "unauthenticated",
  invalid_result: "invalid-result",
  service_unavailable: "service-unavailable",
  unknown: "unknown",
};

/** True only when a non-empty Worker URL was resolved at bundle time — mirrors isAiAssistantConfigured's own check. */
export function isAiWorkerConfigured(workerUrl: string): boolean {
  return workerUrl.trim().length > 0;
}

export type AiWorkerEndpointSummary =
  | { configured: false }
  | { configured: true; hostname: string; protocol: string };

/**
 * Safe-to-log summary of the configured endpoint for development
 * diagnostics — hostname and protocol only, never the full URL (which could
 * include a deployment-specific path or query string), never a token.
 * Returns `{ configured: false }` for an empty/missing URL and also for a
 * malformed one (invalid URLs are exactly the kind of local misconfiguration
 * this exists to surface, not something to throw over).
 */
export function describeAiWorkerEndpoint(workerUrl: string): AiWorkerEndpointSummary {
  if (!isAiWorkerConfigured(workerUrl)) return { configured: false };
  try {
    const url = new URL(workerUrl);
    return { configured: true, hostname: url.hostname, protocol: url.protocol.replace(":", "") };
  } catch {
    return { configured: false };
  }
}
