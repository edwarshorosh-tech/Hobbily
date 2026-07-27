/**
 * Shared moderation types — see services/moderationService.ts for the actual
 * check pipeline and constants/moderationTerms.ts for the term data. Kept in
 * their own file (no logic) so both the Expo app and worker/src (a separate
 * TS project, no shared package boundary today) can each import/mirror this
 * shape without pulling in React Native or Cloudflare Worker specifics.
 */

export type ModerationCategory =
  | "profanity"
  | "sexual_content"
  | "hate_or_slur"
  | "harassment"
  | "threat"
  | "self_harm_encouragement"
  | "drug_sales"
  | "weapon_sales"
  | "personal_data_request"
  | "spam"
  | "scam"
  | "unsafe_contact_request";

export type ModerationSeverity = "low" | "medium" | "high" | "critical";

export type ModerationMatchMode = "exact_token" | "phrase" | "prefix" | "regex";

export type ModerationTerm = {
  id: string;
  language: string;
  /** Already run through normalizeForModeration — the dictionary is authored/stored normalized, so matching never re-normalizes term text at check time. */
  normalizedTerm: string;
  category: ModerationCategory;
  severity: ModerationSeverity;
  matchMode: ModerationMatchMode;
  enabled: boolean;
  version: number;
};

/** A single dictionary's version — bumped whenever constants/moderationTerms.ts's TERMS array changes, so a client and the worker can log/compare which ruleset actually rejected something. */
export const MODERATION_RULESET_VERSION = 3;

export type ModerationCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      category: ModerationCategory;
      severity: ModerationSeverity;
      /** Character range in the ORIGINAL (not normalized) input the match roughly corresponds to, for optional highlighting — best-effort, since normalization can change string length (e.g. "z e r o" collapsing to "zero"). Null when a safe mapping back to the original couldn't be determined. */
      matchStart: number | null;
      matchEnd: number | null;
    };

/** What a create/update endpoint (or the worker's own /moderate check) returns on rejection — never the matched term, rule, or score. */
export type ModerationErrorResponse = {
  code: "CONTENT_NOT_ALLOWED";
  field: string;
  category: ModerationCategory;
  message: string;
};

/** For high/critical violations only — see services/moderationService.ts's own doc comment on where/how this is persisted. Never stores the raw offending text. */
export type ModerationEvent = {
  id: string;
  userId: string;
  surface: string;
  entityId?: string;
  category: ModerationCategory;
  severity: ModerationSeverity;
  createdAt: string;
  ruleVersion: number;
};
