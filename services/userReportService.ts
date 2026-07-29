/**
 * userReportService — submits a "Report user" to Firestore's userReports
 * collection. Write-only from the client (see firestore.rules) — a reporter
 * can create a report but never read it back, same as
 * services/moderationEventService.ts's moderationEvents.
 *
 * Duplicate/spam protection has two layers:
 *  - Real, server-enforced: the doc ID is deterministic
 *    (reporterUserId_reportedUserId_reason_entityId), similar in spirit to
 *    services/friendsService.ts's friendship pair IDs — but unlike a
 *    membership rejoin (which is fine to just re-write), a report must
 *    never be resettable by the reporter once a moderator has touched its
 *    status, so firestore.rules only allows `create` on this collection,
 *    never `update`. Firestore classifies a `setDoc()` targeting a path
 *    that already has a document as an `update`, not a `create` — so a
 *    second identical submission is rejected with `permission-denied`,
 *    which this function specifically catches and treats as a friendly
 *    "you already reported this" outcome rather than an error. A genuinely
 *    new reason or new piece of related content gets its own doc ID and
 *    goes through as a real, new report.
 *  - Best-effort, client-side only: submitUserReport also refuses more than
 *    a few submissions in a short rolling window (in-memory, resets on app
 *    restart). This is a UX guard against accidental rapid re-taps, NOT a
 *    real rate limit — a modified client could ignore it. A real one needs
 *    either Cloud Functions or Firestore rules that can read "how many
 *    reports has this user created in the last N minutes," which requires
 *    a query rules can't run either — the same honest, already-documented
 *    architecture limitation as everywhere else in this Firestore-only app
 *    (see services/moderationService.ts's own doc comment).
 */
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rawErrorCode } from "./firebaseErrors";
import { PendingUserReport, UserReportReason, reportPriority } from "../types/UserReport";
import { reportDocId } from "../utils/userReportId";
import { checkText } from "./moderationService";

const USER_REPORTS = "userReports";

export type SubmitUserReportResult =
  | { ok: true }
  | { ok: true; alreadyReported: true }
  | { ok: false; code: "cannot_report_self" | "rate_limited" | "moderation_blocked" | "network_error" | "unknown"; message: string };

// Best-effort client-side cooldown — see file header. Module-level (not
// persisted) is intentional: this only needs to catch "the same person
// mashing the button in this session," not survive an app restart.
const RECENT_SUBMISSIONS_WINDOW_MS = 60_000;
const MAX_SUBMISSIONS_PER_WINDOW = 3;
let recentSubmissionTimestamps: number[] = [];

function isRateLimited(now: number): boolean {
  recentSubmissionTimestamps = recentSubmissionTimestamps.filter((t) => now - t < RECENT_SUBMISSIONS_WINDOW_MS);
  return recentSubmissionTimestamps.length >= MAX_SUBMISSIONS_PER_WINDOW;
}

export async function submitUserReport(
  pending: PendingUserReport,
  reporterUserId: string,
  reason: UserReportReason,
  description: string
): Promise<SubmitUserReportResult> {
  if (!reporterUserId) {
    return { ok: false, code: "unknown", message: "Please sign in again." };
  }
  if (reporterUserId === pending.reportedUserId) {
    return { ok: false, code: "cannot_report_self", message: "You can't report your own profile." };
  }
  const now = Date.now();
  if (isRateLimited(now)) {
    return { ok: false, code: "rate_limited", message: "You've submitted several reports recently. Please wait a moment and try again." };
  }

  const trimmedDescription = description.trim();
  if (trimmedDescription) {
    // Reporting context ("what happened") is still a free-text field other
    // people (a future moderator) will read — it goes through the same
    // check as everything else, but see the report form's own hint: a
    // reporter is explicitly told they don't need to repeat the offending
    // words themselves, so this should rarely trigger for a genuine report.
    const check = checkText(trimmedDescription);
    if (!check.allowed) {
      return { ok: false, code: "moderation_blocked", message: "This description contains text that is not allowed. You do not need to repeat offensive words — please rephrase." };
    }
  }

  const id = reportDocId(reporterUserId, pending.reportedUserId, reason, pending.relatedEntityId);
  const ref = doc(db, USER_REPORTS, id);

  try {
    await setDoc(ref, {
      reporterUserId,
      reportedUserId: pending.reportedUserId,
      reason,
      description: trimmedDescription || null,
      source: pending.source,
      relatedEntityType: pending.relatedEntityType ?? null,
      relatedEntityId: pending.relatedEntityId ?? null,
      status: "new",
      priority: reportPriority(reason),
      createdAt: serverTimestamp(),
    });
    recentSubmissionTimestamps.push(now);
    return { ok: true };
  } catch (e) {
    recentSubmissionTimestamps.push(now);
    // A duplicate submission lands here too — see this file's header on why
    // "already exists" surfaces as permission-denied (create-only rules).
    if (rawErrorCode(e).includes("permission-denied")) {
      return { ok: true, alreadyReported: true };
    }
    if (__DEV__) console.warn("[userReportService] submit failed", e);
    return { ok: false, code: "network_error", message: "We could not submit this report. Please check your connection and try again." };
  }
}
