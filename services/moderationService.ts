/**
 * moderationService — the actual text-matching engine. Deliberately has zero
 * Firestore/AsyncStorage import (same convention as services/
 * recurrenceService.ts) so it stays trivially unit-testable and safe to call
 * from any field's onChange without pulling in Firebase init. See
 * services/moderationEventService.ts for the separate, Firestore-backed
 * high/critical event log.
 *
 * This is the CLIENT-SIDE pre-check — fast feedback while typing, and the
 * thing every Save/Send/Publish button gates on. It is NOT the source of
 * truth: this app has no custom backend beyond the Cloudflare AI worker
 * (worker/src/*), and Firestore Security Rules cannot run this kind of text
 * analysis (they can only check structure/size — see firestore.rules' own
 * .size() checks).
 *
 * worker/src/moderation.ts mirrors this same matching logic as a real,
 * deployable server-side check (a POST /moderate endpoint on the existing
 * Cloudflare Worker) — but as of this pass the app's own screens still only
 * call checkText() directly, not that endpoint. Wiring every call site
 * below to also await a network round-trip (with its own loading/offline/
 * timeout handling) is a real follow-up, not done here to avoid turning an
 * already-large change into an even larger one under time pressure. Until
 * that wiring exists, a modified client (or a direct API request) can skip
 * both checks and write text Firestore's rules don't parse — an honest,
 * currently-real gap in this Firestore-only architecture, not something
 * closeable without either that wiring or genuine backend infrastructure
 * (Cloud Functions or equivalent) this project doesn't have today.
 */
import { normalizeForModeration } from "../utils/moderation/normalize";
import { MODERATION_TERMS } from "../constants/moderationTerms";
import { MODERATION_RULESET_VERSION, ModerationCategory, ModerationCheckResult, ModerationSeverity, ModerationTerm } from "../types/Moderation";

/**
 * Thrown by a hook/service `add`/`edit` function (e.g. usePostComments,
 * CommunityContext.sendMessage) when checkText blocks the text — lets the
 * calling screen's existing try/catch distinguish "blocked by moderation"
 * from a generic network/permission failure and show the right message,
 * instead of silently no-op-returning (which used to look like a
 * successful post/send to the caller — the input got cleared and no error
 * ever appeared, even though nothing was actually saved).
 */
export class ModerationBlockedError extends Error {
  category: ModerationCategory;
  severity: ModerationSeverity;
  constructor(category: ModerationCategory, severity: ModerationSeverity) {
    super("Content blocked by moderation");
    this.name = "ModerationBlockedError";
    this.category = category;
    this.severity = severity;
  }
}

const LATIN_SCRIPT_LANGS = new Set(["en", "es", "fr", "de"]);
const CYRILLIC_SCRIPT_LANGS = new Set(["ru"]);
const ARABIC_SCRIPT_LANGS = new Set(["ar"]);

/** A term shorter than this is never matched, even if one somehow made it into the dictionary — guards against a short banned fragment matching inside an unrelated longer word (see constants/moderationTerms.ts's own note on minimum length). Regex-mode terms are exempt (their own pattern defines what "too short" means). */
const MIN_TERM_LENGTH = 3;

/** Known-safe tokens that would otherwise collide with a dictionary entry — checked before any exact_token/prefix match. Extend as real false positives turn up; keep short-and-common entries here rather than removing dictionary terms wholesale. */
const ALLOWLIST = new Set<string>([]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits on anything that isn't a letter or digit — Unicode-aware, so this tokenizes Hebrew/Arabic/Cyrillic/Latin text alike. */
function tokenize(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function matchesNonRegexTerm(paddedCandidate: string, tokens: string[], t: ModerationTerm): boolean {
  if (t.matchMode === "exact_token") {
    return tokens.some((tok) => tok === t.normalizedTerm && !ALLOWLIST.has(tok));
  }
  if (t.matchMode === "prefix") {
    return tokens.some((tok) => tok.length >= t.normalizedTerm.length && tok.startsWith(t.normalizedTerm) && !ALLOWLIST.has(tok));
  }
  // "phrase" — word-boundary substring match (not exact_token, since a
  // phrase spans multiple tokens); padding the candidate with spaces lets
  // the boundary regex treat the very start/end of the string as a boundary
  // without a lookbehind (broader engine support).
  const re = new RegExp(`[^\\p{L}\\p{N}]${escapeRegex(t.normalizedTerm)}[^\\p{L}\\p{N}]`, "u");
  return re.test(paddedCandidate);
}

const SEVERITY_RANK: Record<ModerationSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export type ModerationCheckOptions = {
  /** Restricts which term languages are checked — omitted means "all enabled terms". Mainly useful for tests; real callers check everything, since a message can legitimately mix languages. */
  languages?: string[];
};

/**
 * The one function every user-text field's validation calls before
 * publish/save. Pure and synchronous — safe to call on every keystroke for
 * live inline feedback, not just on submit.
 */
export function checkText(rawText: string, options: ModerationCheckOptions = {}): ModerationCheckResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { allowed: true };

  const { collapsed, latinFold, cyrillicFold, arabicFold } = normalizeForModeration(trimmed);
  // regex-mode terms (phone numbers, email addresses, link-shortener
  // patterns) intentionally match against lightly-normalized text only
  // (case + whitespace collapsed) rather than the letter-despaced/leet-
  // folded variants — those transforms would corrupt the literal digit/
  // symbol sequences those patterns depend on (e.g. folding "0" to "o"
  // would break a phone-number regex on real digits).
  const rawLower = trimmed.toLowerCase().replace(/\s+/g, " ");
  // One padded+tokenized pair per fold variant — each dictionary term is
  // matched against whichever variant its own language's evasion tricks get
  // folded into (see normalizeForModeration's own doc comment): Latin-script
  // terms (en/es/fr/de) against latinFold, Russian against cyrillicFold
  // (a Latin lookalike swapped into a Cyrillic word), Arabic against
  // arabicFold (Arabizi digit substitution), everything else (Hebrew, ...)
  // against the plain script-preserving collapsed text.
  const variants: Record<"collapsed" | "latinFold" | "cyrillicFold" | "arabicFold", { padded: string; tokens: string[] }> = {
    collapsed: { padded: ` ${collapsed} `, tokens: tokenize(collapsed) },
    latinFold: { padded: ` ${latinFold} `, tokens: tokenize(latinFold) },
    cyrillicFold: { padded: ` ${cyrillicFold} `, tokens: tokenize(cyrillicFold) },
    arabicFold: { padded: ` ${arabicFold} `, tokens: tokenize(arabicFold) },
  };
  function variantFor(language: string) {
    if (LATIN_SCRIPT_LANGS.has(language)) return variants.latinFold;
    if (CYRILLIC_SCRIPT_LANGS.has(language)) return variants.cyrillicFold;
    if (ARABIC_SCRIPT_LANGS.has(language)) return variants.arabicFold;
    return variants.collapsed;
  }

  let worst: ModerationTerm | null = null;

  for (const t of MODERATION_TERMS) {
    if (!t.enabled) continue;
    if (options.languages && !options.languages.includes(t.language)) continue;
    if (t.matchMode !== "regex" && t.normalizedTerm.length < MIN_TERM_LENGTH) continue;

    let hit = false;
    if (t.matchMode === "regex") {
      try {
        hit = new RegExp(t.normalizedTerm, "iu").test(rawLower);
      } catch {
        hit = false; // a malformed pattern in the dictionary must never crash a save
      }
    } else {
      const { padded, tokens } = variantFor(t.language);
      hit = matchesNonRegexTerm(padded, tokens, t);
    }

    if (hit && (!worst || SEVERITY_RANK[t.severity] > SEVERITY_RANK[worst.severity])) {
      worst = t;
    }
  }

  if (!worst) return { allowed: true };
  // matchStart/matchEnd deliberately always null — precisely mapping a
  // match back to a position in the ORIGINAL (un-normalized) input isn't
  // reliable once separators are removed and repeats collapsed (string
  // length changes), and the spec's own fallback for exactly this case is
  // "don't break the input, show a message under the field" rather than a
  // fragile inline highlight — see the field-level UI this feeds.
  return { allowed: false, category: worst.category, severity: worst.severity, matchStart: null, matchEnd: null };
}

/** high/critical only — see services/moderationEventService.ts for where this actually gets persisted (kept out of this file to keep checkText Firestore-free and trivially testable). */
export function shouldLogModerationEvent(severity: ModerationSeverity): boolean {
  return severity === "high" || severity === "critical";
}

/**
 * User-facing copy — never the internal category, rule, or score (see the
 * spec this implements: "Не показывай пользователю внутреннюю категорию или
 * score"). `kind` picks between the two phrasings the spec itself
 * prescribes for a content field (post/message/comment) vs. a profile
 * settings field (username/bio/city/...).
 */
export function moderationErrorMessage(kind: "content" | "profile_field" = "content"): string {
  return kind === "profile_field"
    ? "This field contains text that is not allowed. Please edit it before saving."
    : "Some of the text is not allowed. Edit the highlighted part before publishing.";
}

export { MODERATION_RULESET_VERSION };
