import { normalizeForModeration } from "../utils/moderation/normalize";

describe("normalizeForModeration", () => {
  it("lowercases and trims", () => {
    expect(normalizeForModeration("  Hello World  ").collapsed).toBe("hello world");
  });

  it("collapses 3+ repeated characters but leaves double letters alone", () => {
    expect(normalizeForModeration("baaaadword").collapsed).toBe("badword");
    expect(normalizeForModeration("committee").collapsed).toBe("committee");
    expect(normalizeForModeration("good").collapsed).toBe("good");
  });

  it("collapses a deliberately letter-spaced-out word", () => {
    expect(normalizeForModeration("b a d w o r d").collapsed).toBe("badword");
    expect(normalizeForModeration("b.a.d.w.o.r.d").collapsed).toBe("badword");
    expect(normalizeForModeration("b-a-d-w-o-r-d").collapsed).toBe("badword");
  });

  it("does NOT merge ordinary multi-word sentences — this was a real regression caught during development", () => {
    expect(normalizeForModeration("this is such nonsense").collapsed).toBe("this is such nonsense");
    expect(normalizeForModeration("i will kill you tomorrow").collapsed).toBe("i will kill you tomorrow");
  });

  it("keeps a genuine single-letter word (English a/i) intact when not part of a spelled-out run", () => {
    expect(normalizeForModeration("i am a cat").collapsed).toBe("i am a cat");
  });

  it("strips zero-width characters used to split a word invisibly", () => {
    expect(normalizeForModeration("b​ad‌word").collapsed).toBe("badword");
  });

  it("collapses varied Unicode whitespace to a single space", () => {
    expect(normalizeForModeration("hello  world").collapsed).toBe("hello world");
  });

  it("latinFold applies leetspeak digit substitution", () => {
    expect(normalizeForModeration("a55").latinFold).toBe("ass");
    expect(normalizeForModeration("h3ll0").latinFold).toBe("hello");
  });

  it("latinFold folds common Cyrillic homoglyphs to Latin, collapsed does not", () => {
    const cyrillicA = "а"; // Cyrillic а — visually identical to Latin "a"
    const result = normalizeForModeration(`${cyrillicA}ss`);
    expect(result.latinFold).toBe("ass");
    expect(result.collapsed).not.toBe("ass");
  });

  it("collapsed preserves genuine Cyrillic text unchanged (script-preserving)", () => {
    expect(normalizeForModeration("привет мир").collapsed).toBe("привет мир");
  });

  it("strips emoji placed between letters to hide a word", () => {
    expect(normalizeForModeration("f😀u😀c😀k").collapsed).toBe("fuck");
    expect(normalizeForModeration("f 😀 u 😀 c 😀 k").collapsed).toBe("fuck");
  });

  it("strips emoji elsewhere in a message without disturbing real words", () => {
    expect(normalizeForModeration("nice photo 😀👍").collapsed).toBe("nice photo");
  });

  // Built via String.fromCodePoint from verified numeric values rather than
  // pasting combining marks directly — they're visually near-impossible to
  // review correctly in a diff/editor once attached to a base letter.
  it("strips Hebrew niqqud/cantillation so a vocalized word matches its plain form", () => {
    // ח (0x05D7) + sheva (0x05B0) + ר (0x05E8) + qamats (0x05B8) + א (0x05D0)
    const vocalized = String.fromCodePoint(0x05d7, 0x05b0, 0x05e8, 0x05b8, 0x05d0);
    expect(normalizeForModeration(vocalized).collapsed).toBe("חרא");
  });

  it("folds Hebrew final letter forms to their regular form", () => {
    // אותך ("you", ends in final chaf ך 0x05DA) -> אותכ (regular chaf כ 0x05DB)
    const withFinal = String.fromCodePoint(0x05d0, 0x05d5, 0x05ea, 0x05da);
    const withRegular = String.fromCodePoint(0x05d0, 0x05d5, 0x05ea, 0x05db);
    expect(normalizeForModeration(withFinal).collapsed).toBe(withRegular);
  });

  it("strips Arabic harakat (diacritics) so a vocalized word matches its plain form", () => {
    // غ (0x063A) + fatha (0x064E) + ب (0x0628) + kasra (0x0650) + ي (0x064A) — "غَبِي" (stupid), vocalized
    const vocalized = String.fromCodePoint(0x063a, 0x064e, 0x0628, 0x0650, 0x064a);
    expect(normalizeForModeration(vocalized).collapsed).toBe("غبي");
  });

  it("strips Arabic tatweel used to break up a word", () => {
    // غ + tatweel(0x0640) + ب + tatweel + ي
    const stretched = String.fromCodePoint(0x063a, 0x0640, 0x0628, 0x0640, 0x064a);
    expect(normalizeForModeration(stretched).collapsed).toBe("غبي");
  });

  it("folds Arabic Alef/Ta-Marbuta/Alef-Maqsura variants to their canonical form", () => {
    const alefHamzaAbove = String.fromCodePoint(0x0623); // أ
    const alefMaqsura = String.fromCodePoint(0x0649); // ى
    const bareAlef = String.fromCodePoint(0x0627); // ا
    const ya = String.fromCodePoint(0x064a); // ي
    expect(normalizeForModeration(alefHamzaAbove).collapsed).toBe(bareAlef);
    expect(normalizeForModeration(alefMaqsura).collapsed).toBe(ya);
  });

  it("folds Arabic-Indic digits to ASCII digits", () => {
    // ٠١٢٣٤٥٦٧٨٩ (Arabic-Indic 0-9, 0x0660-0x0669)
    const arabicDigits = String.fromCodePoint(0x0660, 0x0661, 0x0662, 0x0663, 0x0664, 0x0665, 0x0666, 0x0667, 0x0668, 0x0669);
    expect(normalizeForModeration(arabicDigits).collapsed).toBe("0123456789");
  });

  it("arabicFold maps common Arabizi chat-alphabet digits back to Arabic letters", () => {
    // "5" is conventionally خ (kha) in Arabizi
    const kha = String.fromCodePoint(0x062e);
    expect(normalizeForModeration("5").arabicFold).toBe(kha);
  });

  it("cyrillicFold maps common Latin lookalikes back to Cyrillic, collapsed does not", () => {
    // Latin "c" swapped into an otherwise-Cyrillic word ("cука" instead of "сука")
    const cyrillicSuka = String.fromCodePoint(0x0441, 0x0443, 0x043a, 0x0430); // сука
    const mixed = "c" + String.fromCodePoint(0x0443, 0x043a, 0x0430); // c+ука
    const result = normalizeForModeration(mixed);
    expect(result.cyrillicFold).toBe(cyrillicSuka);
    expect(result.collapsed).not.toBe(cyrillicSuka);
  });
});
