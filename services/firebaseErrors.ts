/**
 * firebaseErrors
 * Shared raw-Firebase-error → {code, message} mapping. Every service that
 * wraps Firestore/Storage SDK errors in its own typed Error class
 * (FriendServiceError, NotificationServiceError, AvatarServiceError) derives
 * that class's code/message from this single place instead of maintaining
 * its own copy — only the three codes every service actually surfaces to the
 * UI are handled here. Service-specific business-logic codes (e.g.
 * "already-friends" in friendsService.ts) never go through this function.
 */

export type FirebaseErrorCode = "permission-denied" | "network-error" | "unknown";

// Firestore and Storage use different code strings for the same failure
// (Firestore: "permission-denied"/"cancelled"; Storage: "storage/unauthorized"/
// "storage/canceled") — substring matching lets one list cover both SDKs.
const PERMISSION_DENIED_MATCHES = ["permission-denied", "unauthorized", "permission"];
const NETWORK_ERROR_MATCHES = [
  "unavailable",
  "deadline-exceeded",
  "cancelled", // Firestore spelling
  "canceled", // Firebase Storage spelling
  "network",
  "retry-limit-exceeded",
];

/** Pulls the SDK's `code` string off a raw caught error, or "" if it doesn't have one. */
export function rawErrorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
}

/**
 * Maps a raw Firestore/Storage SDK error to one of the three codes every
 * service's own error class exposes, plus a ready-to-show message. Logs the
 * original error via console.warn in dev builds when it falls through to
 * "unknown", tagged with `logTag` so it's traceable to its calling service.
 */
export function mapFirebaseError(e: unknown, logTag: string): { code: FirebaseErrorCode; message: string } {
  const code = rawErrorCode(e);

  if (PERMISSION_DENIED_MATCHES.some((m) => code.includes(m))) {
    return { code: "permission-denied", message: "You don't have permission to do that." };
  }
  if (NETWORK_ERROR_MATCHES.some((m) => code.includes(m))) {
    return { code: "network-error", message: "Network error — please try again." };
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[${logTag}]`, e);
  }
  return { code: "unknown", message: "Something went wrong. Please try again." };
}
