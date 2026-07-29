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
 *  - Every entry here is written as natural, readable text (correct casing/
 *    grammar, e.g. Hebrew final letter forms where grammar requires them) —
 *    the `term()` builder below runs it through normalizeForModeration()'s
 *    `collapsed` output before storing it, so the stored value already
 *    matches whatever the input pipeline folds real user text to (lowercase,
 *    diacritics stripped, Hebrew final-forms and Arabic letter-form variants
 *    folded, ...). Don't hand-pre-fold entries yourselves — write them
 *    naturally and let the builder normalize them, exactly once, consistently.
 *  - v3 adds Hebrew ("he") and Arabic ("ar") coverage, plus expands Russian.
 *    Same sourcing rule applies: ordinary, unambiguous profanity/threat/
 *    self-harm/drug phrases built from ordinary vocabulary, never slurs —
 *    and the same honest caveat applies even more strongly here: this was
 *    authored without a native Hebrew or Arabic speaker's review. The words
 *    / phrases below are common, well-documented items (the kind any public
 *    profanity-filter word list for these languages would include), kept
 *    deliberately short and unambiguous to minimize false positives, but
 *    dialectal variation (especially for Arabic — Gulf/Levantine/Egyptian/
 *    Maghrebi usage differs a lot) means this is a best-effort starting
 *    point, not a verified-complete list. Have a native speaker review
 *    before treating it as authoritative, same as any other entry here.
 *  - Tokenization/matching already Just Works for Hebrew and Arabic with no
 *    engine changes: `\p{L}` (used by tokenize() and the letter-spacing
 *    collapse in utils/moderation/normalize.ts) covers Hebrew and Arabic
 *    script. Hebrew have no upper/lower case, so `.toLowerCase()` is a
 *    harmless no-op for it.
 *  - v4 (services/moderationService.ts): each language now matches against
 *    the fold variant that mirrors its own real evasion convention — English
 *    (+es/fr/de) against `latinFold` (leetspeak + Cyrillic/Greek homoglyphs
 *    folded to Latin), Russian against `cyrillicFold` (the inverse: a Latin
 *    lookalike swapped into a Cyrillic word, folded back), Arabic against
 *    `arabicFold` (Arabizi digit substitution folded back to Arabic script),
 *    Hebrew still against the plain `collapsed` text — Hebrew has no
 *    comparably common "respell it another way" slang convention to fold
 *    against, and no homoglyph table was added for it either: unlike
 *    Cyrillic, Hebrew/Arabic letterforms aren't visually confusable with
 *    Latin letters, so that isn't a realistic evasion vector for either.
 */
import { ModerationTerm } from "../types/Moderation";
import { normalizeForModeration } from "../utils/moderation/normalize";

/** Bump whenever this array changes — mirrored in MODERATION_RULESET_VERSION (types/Moderation.ts) and worker/src/moderation.ts, which must be kept in sync by hand (see that file's own comment on why it can't literally import this one). */
export const TERMS_VERSION = 4;

function term(
  id: string,
  language: string,
  rawTerm: string,
  category: ModerationTerm["category"],
  severity: ModerationTerm["severity"],
  matchMode: ModerationTerm["matchMode"] = "exact_token"
): ModerationTerm {
  // regex-mode terms are literal patterns, not text to fold — normalizing
  // one would corrupt its syntax (e.g. escaped digits/symbols).
  const normalizedTerm = matchMode === "regex" ? rawTerm : normalizeForModeration(rawTerm).collapsed;
  return { id, language, normalizedTerm, category, severity, matchMode, enabled: true, version: TERMS_VERSION };
}

export const MODERATION_TERMS: ModerationTerm[] = [
  // ── Profanity — common, mild, already-ubiquitous-in-every-filter words ──
  // v2 note: the two most common English curse words ("fuck", "shit") and
  // their ordinary derivations were missing from v1 — that gap, not a UX
  // bug, was the reason plain English profanity sailed through unblocked.
  // These plus the rest below are ordinary swear words already ubiquitous in
  // every public profanity-filter word list (not slurs, not hate speech —
  // see the file header on why hate_or_slur/sexual_content stay empty).
  ...[
    "damn", "hell", "crap", "ass", "bitch", "bastard", "dick", "piss", "bullshit", "asshole",
    "fuck", "fucking", "fucked", "fucker", "fuckface", "motherfucker",
    "shit", "shitty", "shithead", "bullshitting",
    "cunt", "twat", "wanker", "prick", "cock", "pussy", "whore", "slut",
    "douchebag", "dumbass", "jackass", "skank", "bollocks", "arsehole", "bugger",
  ].map((w, i) => term(`profanity_en_${i}`, "en", w, "profanity", "medium")),
  ...[
    "блять", "сука", "хуй", "пизда", "ебать", "мудак", "долбоеб", "гандон", "хер", "дрочить",
    // v3 additions — common standalone insults/curses, same "ubiquitous,
    // not a slur" bar as the English list above.
    "пиздец", "ебаный", "уебок", "мразь", "тварь", "дебил", "придурок",
    "сволочь", "урод", "гнида", "чмо", "тупица",
  ].map((w, i) => term(`profanity_ru_${i}`, "ru", w, "profanity", "medium")),
  // ── Hebrew profanity — common, unambiguous; short/collision-prone words
  // (e.g. the vulgar sense of "כוס" also just means "cup") deliberately left
  // out rather than risk everyday false positives.
  ...[
    "חרא", "מניאק", "טמבל", "אידיוט", "זונה", "מזדיין",
  ].map((w, i) => term(`profanity_he_${i}`, "he", w, "profanity", "medium")),
  term("profanity_he_phrase_0", "he", "בן זונה", "profanity", "medium", "phrase"),
  term("profanity_he_phrase_1", "he", "חתיכת חרא", "profanity", "medium", "phrase"),
  // ── Arabic profanity — common MSA/pan-Arab terms. Dialectal profanity
  // (Egyptian/Gulf/Levantine/Maghrebi) varies widely and isn't covered here
  // — see the file header's caveat on this.
  ...[
    "خرا", "خراء", "احمق", "غبي", "حقير",
  ].map((w, i) => term(`profanity_ar_${i}`, "ar", w, "profanity", "medium")),
  term("profanity_ar_phrase_0", "ar", "ابن كلب", "profanity", "medium", "phrase"),
  term("profanity_ar_phrase_1", "ar", "تبا لك", "profanity", "medium", "phrase"),

  // ── Harassment / threat — plain-language phrases, not slurs ──
  ...[
    "kill you", "i will kill you", "i'll kill you", "i will hurt you", "i'll hurt you",
    "i will find you", "you will pay for this", "watch your back",
  ].map((p, i) => term(`threat_en_${i}`, "en", p, "threat", "high", "phrase")),
  ...[
    "убью тебя", "я тебя убью", "найду тебя", "ты пожалеешь", "я тебя достану",
  ].map((p, i) => term(`threat_ru_${i}`, "ru", p, "threat", "high", "phrase")),
  ...[
    "אני אהרוג אותך", "אני אמצא אותך",
  ].map((p, i) => term(`threat_he_${i}`, "he", p, "threat", "high", "phrase")),
  ...[
    "سأقتلك", "سوف أقتلك",
  ].map((p, i) => term(`threat_ar_${i}`, "ar", p, "threat", "high", "phrase")),

  // ── Self-harm encouragement — important for a teen-facing app ──
  ...[
    "kill yourself", "kys", "you should die", "go die", "end your life",
  ].map((p, i) => term(`selfharm_en_${i}`, "en", p, "self_harm_encouragement", "critical", "phrase")),
  ...[
    "убей себя", "иди сдохни", "покончи с собой", "иди повесься",
  ].map((p, i) => term(`selfharm_ru_${i}`, "ru", p, "self_harm_encouragement", "critical", "phrase")),
  ...[
    "לך תמות", "תתאבד",
  ].map((p, i) => term(`selfharm_he_${i}`, "he", p, "self_harm_encouragement", "critical", "phrase")),
  ...[
    "اذهب و مت", "انتحر",
  ].map((p, i) => term(`selfharm_ar_${i}`, "ar", p, "self_harm_encouragement", "critical", "phrase")),

  // ── Drug sales — plain descriptive phrases ──
  ...[
    "buy weed", "sell weed", "buy drugs", "sell drugs", "weed for sale", "drugs for sale",
  ].map((p, i) => term(`drugs_en_${i}`, "en", p, "drug_sales", "high", "phrase")),
  ...[
    "продам травку", "куплю травку", "продам наркотики",
  ].map((p, i) => term(`drugs_ru_${i}`, "ru", p, "drug_sales", "high", "phrase")),
  ...[
    "מוכר חשיש", "קונה חשיש",
  ].map((p, i) => term(`drugs_he_${i}`, "he", p, "drug_sales", "high", "phrase")),
  ...[
    "بيع مخدرات", "شراء مخدرات",
  ].map((p, i) => term(`drugs_ar_${i}`, "ar", p, "drug_sales", "high", "phrase")),

  // ── Weapon sales — plain descriptive phrases ──
  ...[
    "buy a gun", "sell a gun", "gun for sale", "buy a knife for sale",
  ].map((p, i) => term(`weapons_en_${i}`, "en", p, "weapon_sales", "high", "phrase")),
  ...[
    "куплю пистолет", "продам пистолет", "куплю нож",
  ].map((p, i) => term(`weapons_ru_${i}`, "ru", p, "weapon_sales", "high", "phrase")),

  // ── Unsafe contact requests / personal data requests — high value for a teen app ──
  ...[
    "send nudes", "send pics of yourself", "meet me alone", "don't tell your parents",
    "what's your address", "where do you live exactly", "add me on snap privately",
  ].map((p, i) => term(`unsafe_contact_en_${i}`, "en", p, "unsafe_contact_request", "critical", "phrase")),
  ...[
    "пришли фото без одежды", "встретимся наедине", "не говори родителям",
  ].map((p, i) => term(`unsafe_contact_ru_${i}`, "ru", p, "unsafe_contact_request", "critical", "phrase")),
  ...[
    "שלח תמונות עירום", "אל תספר להורים", "נפגש לבד",
  ].map((p, i) => term(`unsafe_contact_he_${i}`, "he", p, "unsafe_contact_request", "critical", "phrase")),
  ...[
    "أرسل صور بدون ملابس", "لا تخبر والديك", "نلتقي وحدنا",
  ].map((p, i) => term(`unsafe_contact_ar_${i}`, "ar", p, "unsafe_contact_request", "critical", "phrase")),
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
