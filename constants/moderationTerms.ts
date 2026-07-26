/**
 * moderationTerms — the versioned term list services/moderationService.ts
 * matches normalized text against. See types/Moderation.ts for the shape.
 *
 * Scope and sourcing, read before extending this file:
 *  - This is a STARTER dictionary, not a production-scale moderation corpus.
 *    It intentionally covers only entries that are safe and unambiguous for
 *    a developer to author directly in source (common, already-public-
 *    knowledge mild profanity; plain-language threat/self-harm/drug/weapon
 *    phrases built from ordinary words, not slurs; and pattern-based safety
 *    categories — spam/scam/personal-data/unsafe-contact-requests — which
 *    are especially high-value for this app's teen audience and don't
 *    require a word list at all).
 *  - `hate_or_slur` and `sexual_content` are deliberately left EMPTY here.
 *    A real slur/hate-speech or explicit-sexual-content list has to come
 *    from a maintained, vetted moderation data provider — inventing one
 *    (guessing at slurs across 8 languages) is explicitly out of scope; see
 *    this project's own instruction not to fabricate insults/translations
 *    without verification. Wire a real provider's list into this same
 *    ModerationTerm shape when one is selected; the matching engine already
 *    supports both categories.
 *  - Every entry here is normalized (lowercase) at authoring time — the
 *    matcher never re-normalizes term text, only the input being checked.
 */
import { ModerationTerm } from "../types/Moderation";

/** Bump whenever this array changes — mirrored in MODERATION_RULESET_VERSION (types/Moderation.ts) and worker/src/moderation.ts, which must be kept in sync by hand (see that file's own comment on why it can't literally import this one). */
export const TERMS_VERSION = 1;

function term(
  id: string,
  language: string,
  normalizedTerm: string,
  category: ModerationTerm["category"],
  severity: ModerationTerm["severity"],
  matchMode: ModerationTerm["matchMode"] = "exact_token"
): ModerationTerm {
  return { id, language, normalizedTerm, category, severity, matchMode, enabled: true, version: TERMS_VERSION };
}

export const MODERATION_TERMS: ModerationTerm[] = [
  // ── Profanity — common, mild, already-ubiquitous-in-every-filter words ──
  ...[
    "damn", "hell", "crap", "ass", "bitch", "bastard", "dick", "piss", "bullshit", "asshole",
  ].map((w, i) => term(`profanity_en_${i}`, "en", w, "profanity", "medium")),
  ...[
    "блять", "сука", "хуй", "пизда", "ебать", "мудак", "долбоеб", "гандон", "хер", "дрочить",
  ].map((w, i) => term(`profanity_ru_${i}`, "ru", w, "profanity", "medium")),

  // ── Harassment / threat — plain-language phrases, not slurs ──
  ...[
    "kill you", "i will kill you", "i'll kill you", "i will hurt you", "i'll hurt you",
    "i will find you", "you will pay for this", "watch your back",
  ].map((p, i) => term(`threat_en_${i}`, "en", p, "threat", "high", "phrase")),
  ...[
    "убью тебя", "я тебя убью", "найду тебя", "ты пожалеешь",
  ].map((p, i) => term(`threat_ru_${i}`, "ru", p, "threat", "high", "phrase")),

  // ── Self-harm encouragement — important for a teen-facing app ──
  ...[
    "kill yourself", "kys", "you should die", "go die", "end your life",
  ].map((p, i) => term(`selfharm_en_${i}`, "en", p, "self_harm_encouragement", "critical", "phrase")),
  ...[
    "убей себя", "иди сдохни",
  ].map((p, i) => term(`selfharm_ru_${i}`, "ru", p, "self_harm_encouragement", "critical", "phrase")),

  // ── Drug sales — plain descriptive phrases ──
  ...[
    "buy weed", "sell weed", "buy drugs", "sell drugs", "weed for sale", "drugs for sale",
  ].map((p, i) => term(`drugs_en_${i}`, "en", p, "drug_sales", "high", "phrase")),
  ...[
    "продам травку", "куплю травку", "продам наркотики",
  ].map((p, i) => term(`drugs_ru_${i}`, "ru", p, "drug_sales", "high", "phrase")),

  // ── Weapon sales — plain descriptive phrases ──
  ...[
    "buy a gun", "sell a gun", "gun for sale", "buy a knife for sale",
  ].map((p, i) => term(`weapons_en_${i}`, "en", p, "weapon_sales", "high", "phrase")),

  // ── Unsafe contact requests / personal data requests — high value for a teen app ──
  ...[
    "send nudes", "send pics of yourself", "meet me alone", "don't tell your parents",
    "what's your address", "where do you live exactly", "add me on snap privately",
  ].map((p, i) => term(`unsafe_contact_en_${i}`, "en", p, "unsafe_contact_request", "critical", "phrase")),
  ...[
    "пришли фото без одежды", "встретимся наедине", "не говори родителям",
  ].map((p, i) => term(`unsafe_contact_ru_${i}`, "ru", p, "unsafe_contact_request", "critical", "phrase")),
  // A phone number-shaped run of digits, anywhere in the text — regex mode
  // is checked against lightly-normalized (not leet-folded) text, see
  // moderationService.ts's own comment on why.
  term("personal_data_phone", "en", "(?:\\+?\\d[\\s.-]?){7,}", "personal_data_request", "medium", "regex"),
  // A bare email address.
  term("personal_data_email", "en", "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", "personal_data_request", "low", "regex"),

  // ── Spam / scam — plain phrases + link-shortener pattern ──
  ...[
    "click here to win", "you have won a prize", "make money fast", "work from home earn",
    "free gift card", "double your money",
  ].map((p, i) => term(`spam_en_${i}`, "en", p, "spam", "medium", "phrase")),
  ...[
    "переходи по ссылке", "заработок без вложений",
  ].map((p, i) => term(`spam_ru_${i}`, "ru", p, "spam", "medium", "phrase")),
  term("scam_link_shortener", "en", "(bit\\.ly|tinyurl\\.com|t\\.me)\\/[a-z0-9]+", "scam", "medium", "regex"),

  // hate_or_slur, sexual_content: intentionally empty — see file header.
];
