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
});
