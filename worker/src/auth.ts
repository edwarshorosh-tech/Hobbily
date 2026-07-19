/**
 * auth — verifies the Expo client is a signed-in Hobbily user before any
 * Hugging Face call is made.
 *
 * firebase-admin is Node-only and cannot run on the Workers runtime, so
 * instead of duplicating a JWT/JWKS verifier, this calls Google's Identity
 * Toolkit `accounts:lookup` REST endpoint with the client's Firebase ID
 * token — Google's own server validates the token and returns the account
 * it belongs to, which is an authoritative check.
 *
 * FIREBASE_WEB_API_KEY is the same public `apiKey` already committed in the
 * Expo app's lib/firebase.ts. It identifies the Firebase project, not a
 * credential — Firebase web API keys are designed to be public. It is NOT
 * the same kind of value as HF_TOKEN and does not need secret handling.
 */
import { WorkerError } from "./errors";

export type VerifiedUser = { uid: string };

type LookupResponse = { users?: { localId?: string }[] };

export async function verifyFirebaseIdToken(idToken: string, apiKey: string): Promise<VerifiedUser> {
  if (!idToken) {
    throw new WorkerError("unauthenticated", "Please sign in again.");
  }

  let res: Response;
  try {
    res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new WorkerError("service_unavailable", "Couldn't verify your session. Please try again.");
  }

  if (!res.ok) {
    throw new WorkerError("unauthenticated", "Your session has expired. Please sign in again.");
  }

  const data = (await res.json().catch(() => ({}))) as LookupResponse;
  const uid = data.users?.[0]?.localId;
  if (!uid) {
    throw new WorkerError("unauthenticated", "Your session has expired. Please sign in again.");
  }

  return { uid };
}
