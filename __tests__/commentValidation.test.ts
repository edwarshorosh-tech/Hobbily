import { isValidCommentText, normalizeCommentText, MAX_COMMENT_LENGTH } from "../utils/commentValidation";

describe("isValidCommentText", () => {
  it("rejects empty text", () => {
    expect(isValidCommentText("")).toBe(false);
  });

  it("rejects whitespace-only text", () => {
    expect(isValidCommentText("   \n\t  ")).toBe(false);
  });

  it("accepts ordinary text", () => {
    expect(isValidCommentText("Great post!")).toBe(true);
  });

  it("accepts emoji and unicode", () => {
    expect(isValidCommentText("Nice 🎉 שלום")).toBe(true);
  });

  it("enforces the maximum length", () => {
    const atLimit = "a".repeat(MAX_COMMENT_LENGTH);
    const overLimit = "a".repeat(MAX_COMMENT_LENGTH + 1);
    expect(isValidCommentText(atLimit)).toBe(true);
    expect(isValidCommentText(overLimit)).toBe(false);
  });
});

describe("normalizeCommentText", () => {
  it("trims leading/trailing whitespace, matching production's submit-path behavior", () => {
    expect(normalizeCommentText("  hello world  ")).toBe("hello world");
  });

  it("preserves internal whitespace/newlines", () => {
    expect(normalizeCommentText("  line one\nline two  ")).toBe("line one\nline two");
  });
});
