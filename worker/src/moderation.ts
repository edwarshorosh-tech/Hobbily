/**
 * moderation — server-side mirror of the Expo app's client-side moderation
 * pre-check (services/moderationService.ts, utils/moderation/normalize.ts,
 * constants/moderationTerms.ts). This Worker is a separate TS project (its
 * own package.json/tsconfig, no shared workspace package boundary with the
 * Expo app today), so the matching algorithm and dictionary are ported here
 * by hand rather than imported — MUST be kept in sync manually whenever
 * either copy changes. This is what makes the check genuinely server-side:
 * Firestore Security Rules can only validate structure/size (see
 * firestore.rules' own .size() checks), never run text analysis like this.
 *
 * As of this pass the Expo app does not yet call POST /moderate (see
 * services/moderationService.ts's own doc comment on why) — this endpoint
 * exists and is deployable, but wiring every save/send/publish call site to
 * also await it is a follow-up. Until then this is a real, working piece of
 * server infrastructure that isn't in the client's request path yet.
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
type MatchMode = "exact_token" | "phrase" | "prefix" | "regex";

type Term = {
  language: string;
  normalizedTerm: string;
  category: ModerationCategory;
  severity: ModerationSeverity;
  matchMode: MatchMode;
};

export type ModerationCheckResult =
  | { allowed: true }
  | { allowed: false; category: ModerationCategory; severity: ModerationSeverity };

// ── Normalization (ported from utils/moderation/normalize.ts) ──────────────

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
// Kept in sync by hand with utils/moderation/normalize.ts's EMOJI_RE.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu;
const WORD_SPLIT_RE = /[ .\-_,]+/;
const SINGLE_CHAR_WORD_RE = /^[\p{L}\p{N}]$/u;

function collapseLetterSpacing(input: string): string {
  const words = input.split(WORD_SPLIT_RE);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    if (SINGLE_CHAR_WORD_RE.test(words[i])) {
      let j = i;
      let merged = "";
      while (j < words.length && SINGLE_CHAR_WORD_RE.test(words[j])) {
        merged += words[j];
        j++;
      }
      if (j - i >= 2) {
        out.push(merged);
        i = j;
        continue;
      }
    }
    out.push(words[i]);
    i++;
  }
  return out.join(" ");
}

function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/gu, "$1");
}

const LEET_MAP: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

const HOMOGLYPH_MAP: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", х: "x", у: "y",
  ѕ: "s", і: "i", ј: "j", α: "a", β: "b", ε: "e", κ: "k", ο: "o", ρ: "p", τ: "t", υ: "y", χ: "x",
};

function applyCharMap(input: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of input) out += map[ch] ?? ch;
  return out;
}

function normalizeForModeration(rawInput: string): { collapsed: string; latinFold: string } {
  const nfkc = rawInput.normalize("NFKC");
  const stripped = nfkc.replace(ZERO_WIDTH_RE, "").replace(EMOJI_RE, "");
  const spaced = stripped.replace(/\s+/g, " ").trim();
  const lower = spaced.toLowerCase();
  const despaced = collapseLetterSpacing(lower);
  const collapsed = collapseRepeats(despaced).replace(/ {2,}/g, " ").trim();
  const latinFold = applyCharMap(applyCharMap(collapsed, LEET_MAP), HOMOGLYPH_MAP);
  return { collapsed, latinFold };
}

// ── Dictionary (ported subset of constants/moderationTerms.ts — see that
// file's own header for sourcing/scope notes; not repeated here) ──────────

function t(language: string, normalizedTerm: string, category: ModerationCategory, severity: ModerationSeverity, matchMode: MatchMode = "exact_token"): Term {
  return { language, normalizedTerm, category, severity, matchMode };
}

const TERMS: Term[] = [
  // v2: added the two most common English curse words ("fuck", "shit") and
  // their ordinary derivations — missing from v1, which is why plain English
  // profanity wasn't blocked. Kept in sync by hand with
  // constants/moderationTerms.ts (see this file's own header).
  ...[
    "damn", "hell", "crap", "ass", "bitch", "bastard", "dick", "piss", "bullshit", "asshole",
    "fuck", "fucking", "fucked", "fucker", "fuckface", "motherfucker",
    "shit", "shitty", "shithead", "bullshitting",
    "cunt", "twat", "wanker", "prick", "cock", "pussy", "whore", "slut",
    "douchebag", "dumbass", "jackass", "skank", "bollocks", "arsehole", "bugger",
  ].map((w) => t("en", w, "profanity", "medium")),
  ...[
    "блять", "сука", "хуй", "пизда", "ебать", "мудак", "долбоеб", "гандон", "хер", "дрочить",
    "пиздец", "ебаный", "уебок", "мразь", "тварь", "дебил", "придурок", "сволочь", "урод", "гнида", "чмо", "тупица",
  ].map((w) => t("ru", w, "profanity", "medium")),
  // Hebrew/Arabic: same sourcing caveat as constants/moderationTerms.ts's
  // file header — best-effort, not native-speaker-verified.
  ...["חרא", "מניאק", "טמבל", "אידיוט", "זונה", "מזדיין"].map((w) => t("he", w, "profanity", "medium")),
  t("he", "בן זונה", "profanity", "medium", "phrase"),
  t("he", "חתיכת חרא", "profanity", "medium", "phrase"),
  ...["خرا", "خراء", "احمق", "غبي", "حقير"].map((w) => t("ar", w, "profanity", "medium")),
  t("ar", "ابن كلب", "profanity", "medium", "phrase"),
  t("ar", "تبا لك", "profanity", "medium", "phrase"),
  ...["kill you", "i will kill you", "i'll kill you", "i will hurt you", "i'll hurt you", "i will find you", "you will pay for this", "watch your back"].map((p) => t("en", p, "threat", "high", "phrase")),
  ...["убью тебя", "я тебя убью", "найду тебя", "ты пожалеешь", "я тебя достану"].map((p) => t("ru", p, "threat", "high", "phrase")),
  ...["אני אהרוג אותך", "אני אמצא אותך"].map((p) => t("he", p, "threat", "high", "phrase")),
  ...["سأقتلك", "سوف أقتلك"].map((p) => t("ar", p, "threat", "high", "phrase")),
  ...["kill yourself", "kys", "you should die", "go die", "end your life"].map((p) => t("en", p, "self_harm_encouragement", "critical", "phrase")),
  ...["убей себя", "иди сдохни", "покончи с собой", "иди повесься"].map((p) => t("ru", p, "self_harm_encouragement", "critical", "phrase")),
  ...["לך תמות", "תתאבד"].map((p) => t("he", p, "self_harm_encouragement", "critical", "phrase")),
  ...["اذهب و مت", "انتحر"].map((p) => t("ar", p, "self_harm_encouragement", "critical", "phrase")),
  ...["buy weed", "sell weed", "buy drugs", "sell drugs", "weed for sale", "drugs for sale"].map((p) => t("en", p, "drug_sales", "high", "phrase")),
  ...["продам травку", "куплю травку", "продам наркотики"].map((p) => t("ru", p, "drug_sales", "high", "phrase")),
  ...["מוכר חשיש", "קונה חשיש"].map((p) => t("he", p, "drug_sales", "high", "phrase")),
  ...["بيع مخدرات", "شراء مخدرات"].map((p) => t("ar", p, "drug_sales", "high", "phrase")),
  ...["buy a gun", "sell a gun", "gun for sale", "buy a knife for sale"].map((p) => t("en", p, "weapon_sales", "high", "phrase")),
  ...["куплю пистолет", "продам пистолет", "куплю нож"].map((p) => t("ru", p, "weapon_sales", "high", "phrase")),
  ...["send nudes", "send pics of yourself", "meet me alone", "don't tell your parents", "what's your address", "where do you live exactly", "add me on snap privately"].map((p) => t("en", p, "unsafe_contact_request", "critical", "phrase")),
  ...["пришли фото без одежды", "встретимся наедине", "не говори родителям"].map((p) => t("ru", p, "unsafe_contact_request", "critical", "phrase")),
  ...["שלח תמונות עירום", "אל תספר להורים", "נפגש לבד"].map((p) => t("he", p, "unsafe_contact_request", "critical", "phrase")),
  ...["أرسل صور بدون ملابس", "لا تخبر والديك", "نلتقي وحدنا"].map((p) => t("ar", p, "unsafe_contact_request", "critical", "phrase")),
  t("en", "(?:\\+?\\d[\\s.-]?){7,}", "personal_data_request", "medium", "regex"),
  t("en", "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", "personal_data_request", "low", "regex"),
  ...["click here to win", "you have won a prize", "make money fast", "work from home earn", "free gift card", "double your money"].map((p) => t("en", p, "spam", "medium", "phrase")),
  ...["переходи по ссылке", "заработок без вложений"].map((p) => t("ru", p, "spam", "medium", "phrase")),
  t("en", "(bit\\.ly|tinyurl\\.com|t\\.me)\\/[a-z0-9]+", "scam", "medium", "regex"),
];

const LATIN_SCRIPT_LANGS = new Set(["en", "es", "fr", "de"]);
const MIN_TERM_LENGTH = 3;
const SEVERITY_RANK: Record<ModerationSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function matchesNonRegexTerm(paddedCandidate: string, tokens: string[], term: Term): boolean {
  if (term.matchMode === "exact_token") return tokens.some((tok) => tok === term.normalizedTerm);
  if (term.matchMode === "prefix") return tokens.some((tok) => tok.length >= term.normalizedTerm.length && tok.startsWith(term.normalizedTerm));
  const re = new RegExp(`[^\\p{L}\\p{N}]${escapeRegex(term.normalizedTerm)}[^\\p{L}\\p{N}]`, "u");
  return re.test(paddedCandidate);
}

export function checkModerationText(rawText: string): ModerationCheckResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { allowed: true };

  const { collapsed, latinFold } = normalizeForModeration(trimmed);
  const rawLower = trimmed.toLowerCase().replace(/\s+/g, " ");
  const collapsedPadded = ` ${collapsed} `;
  const latinPadded = ` ${latinFold} `;
  const collapsedTokens = tokenize(collapsed);
  const latinTokens = tokenize(latinFold);

  let worst: Term | null = null;
  for (const term of TERMS) {
    if (term.matchMode !== "regex" && term.normalizedTerm.length < MIN_TERM_LENGTH) continue;
    let hit = false;
    if (term.matchMode === "regex") {
      try {
        hit = new RegExp(term.normalizedTerm, "iu").test(rawLower);
      } catch {
        hit = false;
      }
    } else {
      const isLatin = LATIN_SCRIPT_LANGS.has(term.language);
      hit = matchesNonRegexTerm(isLatin ? latinPadded : collapsedPadded, isLatin ? latinTokens : collapsedTokens, term);
    }
    if (hit && (!worst || SEVERITY_RANK[term.severity] > SEVERITY_RANK[worst.severity])) worst = term;
  }

  if (!worst) return { allowed: true };
  return { allowed: false, category: worst.category, severity: worst.severity };
}
