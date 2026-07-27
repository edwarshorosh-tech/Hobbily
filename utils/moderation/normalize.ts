/**
 * normalizeForModeration — the shared text-normalization pipeline every
 * moderation check (client-side pre-check and, mirrored, the worker's own
 * /moderate endpoint) runs input through before matching it against
 * constants/moderationTerms.ts. Never mutates what the user actually typed —
 * only ever used to build a comparison string for matching.
 *
 * Produces two variants:
 *  - `collapsed`: case/whitespace/repeat-letter/separator-obfuscation
 *    normalized, but the original script is preserved — this is what
 *    non-Latin-script dictionary terms (Russian, Hebrew, Arabic, ...) are
 *    matched against, so real Cyrillic/Hebrew/Arabic text is never
 *    mistranslated into something else.
 *  - `latinFold`: `collapsed` with leetspeak digits/symbols AND common
 *    Cyrillic/Greek homoglyphs mapped to their Latin lookalike — this is
 *    what Latin-script (English) dictionary terms are matched against, so
 *    "р0ссword"-style obfuscation (Cyrillic а/е/о/р/с/х/у substituted for
 *    visually-identical Latin letters, plus leet digits) doesn't slip past a
 *    plain English word list. Deliberately NOT applied when matching
 *    non-Latin terms — doing so would corrupt genuine Cyrillic/Hebrew/Arabic
 *    input into something that could never match its own language's terms.
 */

export type NormalizedText = {
  collapsed: string;
  latinFold: string;
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
// human ("f\uD83D\uDE00u\uD83D\uDE00c\uD83D\uDE00k") \u2014 stripped entirely rather than treated as a
// delimiter, since removing them is exactly what reconstructs the hidden
// word ("f\uD83D\uDE00u\uD83D\uDE00c\uD83D\uDE00k" -> "fuck"). Not an exhaustive Unicode emoji table (no
// single contiguous range covers every emoji), but covers every block real
// device keyboards actually offer: regional indicators, misc
// symbols-and-pictographs through supplemental symbols, emoticons,
// dingbats/arrows/misc symbols, and the variation-selector range.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/gu;

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

function applyCharMap(input: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of input) {
    out += map[ch] ?? ch;
  }
  return out;
}

export function normalizeForModeration(rawInput: string): NormalizedText {
  const nfkc = rawInput.normalize("NFKC");
  const stripped = nfkc.replace(ZERO_WIDTH_RE, "").replace(EMOJI_RE, "");
  // \s in JS already covers every Unicode White_Space character (NBSP,
  // ideographic space, en/em spaces, BOM, ...) — no custom Unicode space
  // class needed.
  const spaced = stripped.replace(/\s+/g, " ").trim();
  const lower = spaced.toLowerCase();
  const despaced = collapseLetterSpacing(lower);
  const collapsed = collapseRepeats(despaced).replace(/ {2,}/g, " ").trim();

  const latinFold = applyCharMap(applyCharMap(collapsed, LEET_MAP), HOMOGLYPH_MAP);

  return { collapsed, latinFold };
}
