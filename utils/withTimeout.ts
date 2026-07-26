/**
 * withTimeout — races a promise against a timeout so an `await`ed mutation
 * whose transport genuinely hangs (no response at all, not just a slow one —
 * see lib/firebase.ts's own note on this SDK/transport combo's history of
 * "Could not reach Cloud Firestore backend" stalls) can't hold a UI's
 * loading flag `true` forever. Does not cancel the underlying operation —
 * Firestore has no per-call cancellation — it only stops the caller from
 * waiting on it; a write that eventually lands after the timeout still
 * succeeds in the background (safe as long as the mutation itself is
 * idempotent, e.g. a deterministic-id setDoc).
 */
export class TimeoutError extends Error {
  constructor(message = "That's taking longer than expected. Please check your connection and try again.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
