import { UserReportReason } from "../types/UserReport";

/**
 * The deterministic userReports/{id} document ID — reporterUserId +
 * reportedUserId + reason + relatedEntityId (or "profile"). Kept in its own
 * Firestore-free module (same convention as services/moderationService.ts)
 * so it's trivially unit-testable, and so firestore.rules' own
 * independently-reconstructed check of this same scheme has one obvious
 * place to stay in sync with. See services/userReportService.ts for how
 * this makes duplicate-report protection real: `create`-only rules on a
 * path that already has a document reject the write outright.
 */
export function reportDocId(reporterUserId: string, reportedUserId: string, reason: UserReportReason, relatedEntityId?: string | null): string {
  return [reporterUserId, reportedUserId, reason, relatedEntityId ?? "profile"].join("_");
}
