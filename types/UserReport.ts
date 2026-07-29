/**
 * Shared "Report user" types. See services/userReportService.ts for the
 * actual submit flow and firestore.rules' userReports/{reportId} block for
 * the security model — reports are write-only from the client (create-only,
 * no read/update/delete), the same "protected, limited-access" pattern
 * already used for moderationEvents (services/moderationEventService.ts).
 * This app has no moderator/admin console or role model today, so "a
 * moderator reads/updates reports" is aspirational structure, not a live
 * feature — see that file's own comment.
 */

export type UserReportReason =
  | "inappropriate_profile"
  | "harassment_or_bullying"
  | "hate_speech"
  | "threats_or_violence"
  | "sexual_content"
  | "unsafe_contact_request"
  | "spam_or_scam"
  | "impersonation"
  | "underage_safety_concern"
  | "sharing_personal_information"
  | "inappropriate_behavior"
  | "other";

export type UserReportSource = "profile_preview" | "full_profile" | "community_member" | "post" | "message";

export type UserReportRelatedEntityType = "message" | "post" | "comment";

/** Captured the instant "Report user" is tapped — a stable snapshot, not a live reference to whatever's currently on screen (the profile sheet may already be closing/changing by the time the report form actually submits). */
export type PendingUserReport = {
  reportedUserId: string;
  source: UserReportSource;
  relatedEntityType?: UserReportRelatedEntityType | null;
  relatedEntityId?: string | null;
};

/** What gets written to Firestore — reporterUserId is filled in from the authenticated session at submit time, never trusted from any earlier client-held value. */
export type UserReportRecord = {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: UserReportReason;
  description: string | null;
  source: UserReportSource;
  relatedEntityType: UserReportRelatedEntityType | null;
  relatedEntityId: string | null;
  status: "new" | "under_review" | "action_taken" | "no_violation" | "closed";
  priority: "normal" | "high" | "critical";
  createdAt: string;
};

export const MAX_REPORT_DESCRIPTION_LENGTH = 500;

export const HIGH_PRIORITY_REASONS = new Set<UserReportReason>([
  "threats_or_violence",
  "sexual_content",
  "underage_safety_concern",
  "sharing_personal_information",
]);

/** Reasons severe enough that a single report is treated as critical-priority on its own — still never triggers any automatic account action (see services/userReportService.ts). */
export const CRITICAL_PRIORITY_REASONS = new Set<UserReportReason>(["underage_safety_concern"]);

export function reportPriority(reason: UserReportReason): "normal" | "high" | "critical" {
  if (CRITICAL_PRIORITY_REASONS.has(reason)) return "critical";
  if (HIGH_PRIORITY_REASONS.has(reason)) return "high";
  return "normal";
}

export const USER_REPORT_REASON_LABELS: Record<UserReportReason, { label: string; description: string }> = {
  inappropriate_profile: {
    label: "Inappropriate profile",
    description: "The name, photo, bio, hobbies or other profile information is inappropriate.",
  },
  harassment_or_bullying: {
    label: "Harassment or bullying",
    description: "The user is insulting, targeting or repeatedly bothering someone.",
  },
  hate_speech: {
    label: "Hate speech",
    description: "The user is attacking a person or group based on who they are.",
  },
  threats_or_violence: {
    label: "Threats or violence",
    description: "The user is threatening harm to someone.",
  },
  sexual_content: {
    label: "Sexual or inappropriate content",
    description: "The user is sharing or requesting sexual content.",
  },
  unsafe_contact_request: {
    label: "Unsafe contact request",
    description: "The user is asking for private contact, photos, meetings or personal information.",
  },
  spam_or_scam: {
    label: "Spam or scam",
    description: "The user is sending unwanted promotions or trying to scam people.",
  },
  impersonation: {
    label: "Impersonation",
    description: "The user is pretending to be someone else.",
  },
  underage_safety_concern: {
    label: "Safety concern involving a minor",
    description: "The user's behavior may put a young person at risk.",
  },
  sharing_personal_information: {
    label: "Sharing private information",
    description: "The user is sharing someone's private information without consent.",
  },
  inappropriate_behavior: {
    label: "Inappropriate behavior",
    description: "Something else about this user's behavior doesn't feel right.",
  },
  other: {
    label: "Other",
    description: "Something not covered by the reasons above.",
  },
};

export const USER_REPORT_REASONS: UserReportReason[] = [
  "inappropriate_profile",
  "harassment_or_bullying",
  "hate_speech",
  "threats_or_violence",
  "sexual_content",
  "unsafe_contact_request",
  "spam_or_scam",
  "impersonation",
  "underage_safety_concern",
  "sharing_personal_information",
  "inappropriate_behavior",
  "other",
];
