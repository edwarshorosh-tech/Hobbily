/**
 * normalizeForModeration — the shared text-normalization pipeline every
 * moderation check (client-side pre-check and, mirrored, the worker's own
 * /moderate endpoint) runs input through before matching it against
 * constants/moderationTerms.ts. Never mutates what the user actually typed —
 * only ever used to build a comparison string for matching. One pipeline,
 * not per-language functions — a Hebrew niqqud-stripping step is a no-op on
 * Russian text and vice versa, so folding every script's evasion tricks into
 * this single function keeps every surface (chat, posts, profile fields, ...)
 * covered by the exact same logic instead of three drifting copies.
 *
 * Produces four variants, all derived from the same `collapsed` base:
 *  - `collapsed`: case/whitespace/repeat-letter/separator-obfuscation
 *    normalized, diacritics and script-specific letter-form variants folded
 *    (Hebrew niqqud/cantillation/final-forms, Arabic harakat/tatweel/Alef-
 *    Ta Marbuta variants — see below), but the underlying script preserved.
 *    This is what Hebrew dictionary terms are matched against — Hebrew has
 *    no equally common "respell it in a different alphabet" evasion
 *    convention the way Arabic (Arabizi) or Cyrillic (Latin homoglyphs) do,
 *    so folding it into Latin/anything else would only risk corrupting
 *    genuine Hebrew text for no real evasion-resistance benefit.
 *  - `latinFold`: `collapsed` with leetspeak digits/symbols AND common
 *    Cyrillic/Greek homoglyphs mapped to their Latin lookalike — what
 *    Latin-script (English) dictionary terms are matched against, so
 *    "р0ссword"-style obfuscation (Cyrillic а/е/о/р/с/х/у substituted for
 *    visually-identical Latin letters, plus leet digits) doesn't slip past a
 *    plain English word list.
 *  - `cyrillicFold`: `collapsed` with common LATIN lookalikes mapped back to
 *    their Cyrillic counterpart (the inverse direction of latinFold's
 *    Cyrillic→Latin map) — what Russian dictionary terms are matched
 *    against, so "cука" (Latin c + Cyrillic ука) doesn't slip past a plain
 *    Cyrillic word list the same way "р0ссword" would slip past an
 *    unfolded English one.
 *  - `arabicFold`: `collapsed` with Arabic-chat-alphabet ("Arabizi") digit
 *    substitutions (2/3/5/6/7/8 for letters with no easy Latin equivalent)
 *    mapped back to Arabic script — what Arabic dictionary terms are
 *    matched against.
 * Every fold is deliberately NOT cross-applied to other languages' terms —
 * doing so would corrupt genuine Cyrillic/Hebrew/Arabic input into
 * something that could never match its own language's terms.
 */

export type NormalizedText = {
  collapsed: string;
  latinFold: string;
  cyrillicFold: string;
  arabicFold: string;
};

// Characters that render invisibly but can be used to split a banned word
// across "letters" that still read normally to a human: zero-width space
// (U+200B), zero-width non-joiner/joiner (U+200C/U+200D), word joiner
// (U+2060), zero-width no-break space / BOM (U+FEFF). Written as explicit
// \u escapes rather than pasting the literal invisible characters — those
// are impossible to visually verify in a diff/editor and risk silent
// corruption on copy-paste.
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

// Emoji used to hide a word between "letters" that still read normally to a
// human ("f😀u😀c😀k") — stripped entirely rather than treated as a
// delimiter, since removing them is exactly what reconstructs the hidden
// word ("f😀u😀c😀k" -> "fuck"). Not an exhaustive Unicode emoji table (no
// single contiguous range covers every emoji), but covers every block real
// device keyboards actually offer: regional indicators, misc
// symbols-and-pictographs through supplemental symbols, emoticons,
// dingbats/arrows/misc symbols, and the variation-selector range.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu;

// Hebrew cantillation marks (֑-֯), niqqud (ְ-ֽ, ֿ),
// shin/sin dots (ׁ-ׂ), upper/lower dot (ׄ-ׅ), qamats
// qatan (ׇ) — every Hebrew combining diacritic. Deliberately excludes
// real Hebrew punctuation in the same block (maqaf ־, paseq ׀, sof
// pasuq ׃, nun hafukha ׆) — those aren't diacritics and stripping
// them would change actual word/sentence structure, not just an evasion
// trick. Someone typing a banned word fully vocalized with niqqud (or
// pasting text that happens to carry cantillation marks) must still match
// the same unvocalized dictionary entry.
const HEBREW_DIACRITICS_RE = /[֑-ׇֽֿׁׂׅׄ]/g;

// Hebrew final letter forms folded to their regular form so a term authored
// in one form always matches the other (ךתב vs כתב-final-mid mismatches) —
// ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ.
const HEBREW_FINAL_FORMS_MAP: Record<string, string> = {
  "ך": "כ",
  "ם": "מ",
  "ן": "נ",
  "ף": "פ",
  "ץ": "צ",
};

// Arabic harakat/tanwin (ً-ْ), superscript alef (ٰ), and the
// combining hamza-above/below marks (ٓ-ٕ) — every Arabic
// diacritic, so a fully-vocalized word still matches its unvocalized
// dictionary entry. Tatweel (ـ, an elongation character with no
// phonetic value) is stripped separately below since it's also commonly
// inserted *between* letters purely to break up a word ("تـــطـــلب"), the
// same trick as spacing/dashes for Latin/Cyrillic text.
const ARABIC_DIACRITICS_RE = /[ً-ٰٕ]/g;
const ARABIC_TATWEEL_RE = /ـ/g;

// Arabic letter-form variants folded to one canonical form: every Alef
// variant (آ أ إ ٱ) → bare Alef ا; Ta Marbuta ة → Ha ه;
// Alef Maqsura ى → Ya ي; hamza-on-waw/ya (ؤ/ئ) → their base letter.
// Standard normalizations (the same ones a search engine or spell-checker
// applies) — without them, e.g. "الله" and "ألله" (both common spellings)
// would need two separate dictionary entries for every single Arabic term.
const ARABIC_LETTER_FORMS_MAP: Record<string, string> = {
  "آ": "ا",
  "أ": "ا",
  "إ": "ا",
  "ٱ": "ا",
  "ة": "ه",
  "ى": "ي",
  "ؤ": "و",
  "ئ": "ي",
};

// Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits
// folded to plain ASCII digits — matters for the personal_data_phone regex
// term (services/moderationService.ts) matching a phone number typed with
// Arabic-Indic digits, and so digit-based Arabizi substitution below has a
// consistent digit form to work from.
const ARABIC_INDIC_DIGITS_RE = /[٠-٩۰-۹]/g;
function foldArabicDigit(ch: string): string {
  const code = ch.codePointAt(0)!;
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return ch;
}

const WORD_SPLIT_RE = /[ .\-_,]+/;
const SINGLE_CHAR_WORD_RE = /^[\p{L}\p{N}]$/u;

/**
 * Collapses a run of TWO OR MORE consecutive single-character "words"
 * separated by spaces/dots/dashes/underscores/commas into one word — the
 * classic "b a d w o r d" / "b.a.d.w.o.r.d" evasion. Deliberately requires
 * the *run* (not just one boundary) to be single characters: a naive
 * "letter, separator, letter" regex would also match completely ordinary
 * text (the end of one real word followed by the start of the next, e.g.
 * "this is" -> the "s" ending "this" and the "i" starting "is") and merge
 * every sentence into one giant token, destroying real word boundaries
 * everywhere — this only fires when a whole consecutive stretch of
 * single-char tokens appears, which normal multi-letter words never
 * produce. A genuine single-letter word (English "a"/"i", Russian
 * "в"/"с"/"к" prepositions) surrounded by normal words is left alone, since
 * that requires a run length of at least 2 to trigger.
 */
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

// 3+ identical consecutive characters collapse to 1 ("baaaadword" ->
// "badword"). Doesn't touch runs of 1-2 (keeps "good"/"less" etc. intact).
function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/gu, "$1");
}

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

// Common Cyrillic/Greek characters that are visually identical (or near
// identical) to a Latin letter — the standard "Cyrillic homoglyph" evasion
// set. Only covers characters genuinely ambiguous at normal reading size;
// deliberately not an exhaustive Unicode confusables table (that belongs in
// a maintained package, not hand-rolled here — see moderationService.ts's
// own doc comment on dictionary sourcing).
const HOMOGLYPH_MAP: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  х: "x",
  у: "y",
  ѕ: "s",
  і: "i",
  ј: "j",
  α: "a",
  β: "b",
  ε: "e",
  κ: "k",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "y",
  χ: "x",
};

// The inverse direction of (the relevant subset of) HOMOGLYPH_MAP — common
// Latin lookalikes folded back to Cyrillic, so a Russian term matches text
// written with a Latin letter swapped in mid-word ("cука" -> "сука").
// Deliberately a small, unambiguous subset (not every Latin letter maps to
// a plausible Cyrillic lookalike) — same "only genuinely ambiguous
// characters" bar as HOMOGLYPH_MAP itself.
const LATIN_TO_CYRILLIC_MAP: Record<string, string> = {
  a: "а",
  e: "е",
  o: "о",
  p: "р",
  c: "с",
  y: "у",
  x: "х",
};

// Arabic chat alphabet ("Arabizi") digit substitutions folded back to the
// Arabic letter they conventionally stand in for — 2ع (ayn), 3ع/ء (ayn/hamza,
// mapped to ayn as the far more common convention), 5خ (kha), 6ط (ta), 7ح (ha),
// 8ق (qaf). Inherently a best-effort convention (Arabizi isn't
// standardized and varies by region), applied only to text already folded
// to Arabic-Indic-digits-as-ASCII, so a plain phone number ("call me
// 0501234567") is untouched by this map — it only fires within the
// dedicated arabicFold variant used for matching Arabic dictionary terms,
// never for personal_data_phone's regex match (which runs against the
// unfolded rawLower text — see moderationService.ts).
const ARABIZI_MAP: Record<string, string> = {
  "2": "ع",
  "3": "ع",
  "5": "خ",
  "6": "ط",
  "7": "ح",
  "8": "ق",
};

function applyCharMap(input: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of input) {
    out += map[ch] ?? ch;
  }
  return out;
}

export function normalizeForModeration(rawInput: string): NormalizedText {
  const nfkc = rawInput.normalize("NFKC");
  const stripped = nfkc
    .replace(ZERO_WIDTH_RE, "")
    .replace(EMOJI_RE, "")
    .replace(HEBREW_DIACRITICS_RE, "")
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(ARABIC_TATWEEL_RE, "")
    .replace(ARABIC_INDIC_DIGITS_RE, foldArabicDigit);
  const scriptFolded = applyCharMap(applyCharMap(stripped, HEBREW_FINAL_FORMS_MAP), ARABIC_LETTER_FORMS_MAP);
  // \s in JS already covers every Unicode White_Space character (NBSP,
  // ideographic space, en/em spaces, BOM, ...) — no custom Unicode space
  // class needed.
  const spaced = scriptFolded.replace(/\s+/g, " ").trim();
  const lower = spaced.toLowerCase();
  const despaced = collapseLetterSpacing(lower);
  const collapsed = collapseRepeats(despaced).replace(/ {2,}/g, " ").trim();

  const latinFold = applyCharMap(applyCharMap(collapsed, LEET_MAP), HOMOGLYPH_MAP);
  const cyrillicFold = applyCharMap(collapsed, LATIN_TO_CYRILLIC_MAP);
  const arabicFold = applyCharMap(collapsed, ARABIZI_MAP);

  return { collapsed, latinFold, cyrillicFold, arabicFold };
}
