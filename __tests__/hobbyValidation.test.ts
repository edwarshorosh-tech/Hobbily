import { normalizeHobbyName, validateCustomHobby, MIN_CUSTOM_HOBBY_LENGTH, MAX_CUSTOM_HOBBY_LENGTH } from "../utils/hobbyValidation";

/** A non-repeating filler of the given length ("ababab...") — repeat() with a single character would now (correctly) trip the excessive-repeated-characters check below, which these length-boundary tests aren't about. */
function filler(length: number): string {
  return "ab".repeat(Math.ceil(length / 2)).slice(0, length);
}

describe("validateCustomHobby", () => {
  it("accepts a normal hobby name not already selected", () => {
    expect(validateCustomHobby("Skateboarding", ["Reading"])).toBeNull();
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(validateCustomHobby("", [])).not.toBeNull();
    expect(validateCustomHobby("   ", [])).not.toBeNull();
  });

  it("rejects a value shorter than the minimum length", () => {
    expect(validateCustomHobby("a", [])).not.toBeNull();
    expect(validateCustomHobby(filler(MIN_CUSTOM_HOBBY_LENGTH), [])).toBeNull();
  });

  it("rejects a value longer than the maximum length", () => {
    expect(validateCustomHobby(filler(MAX_CUSTOM_HOBBY_LENGTH + 1), [])).not.toBeNull();
    expect(validateCustomHobby(filler(MAX_CUSTOM_HOBBY_LENGTH), [])).toBeNull();
  });

  it("rejects a URL or domain-like value", () => {
    expect(validateCustomHobby("https://example.com", [])).not.toBeNull();
    expect(validateCustomHobby("www.example.com", [])).not.toBeNull();
    expect(validateCustomHobby("instagram.com/x", [])).not.toBeNull();
  });

  it("rejects excessive repeated characters", () => {
    expect(validateCustomHobby("aaaaaaaaaa", [])).not.toBeNull();
  });

  it("does not false-positive a real hobby with a short double letter", () => {
    expect(validateCustomHobby("Knitting", [])).toBeNull();
    expect(validateCustomHobby("Coffee tasting", [])).toBeNull();
  });

  it("rejects punctuation-only input", () => {
    expect(validateCustomHobby("...", [])).not.toBeNull();
    expect(validateCustomHobby("!!!", [])).not.toBeNull();
  });

  it("rejects a case-insensitive duplicate of an already-selected hobby", () => {
    expect(validateCustomHobby("reading", ["Reading"])).not.toBeNull();
    expect(validateCustomHobby("READING", ["Reading"])).not.toBeNull();
  });

  it("trims whitespace before validating", () => {
    expect(validateCustomHobby("  Skateboarding  ", [])).toBeNull();
  });

  it("accepts non-Latin scripts", () => {
    expect(validateCustomHobby("צילום", [])).toBeNull();
  });
});

describe("normalizeHobbyName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeHobbyName("  digital   art  ")).toBe("digital art");
  });

  it("does not force a particular letter case", () => {
    expect(normalizeHobbyName("iOS Development")).toBe("iOS Development");
    expect(normalizeHobbyName("K-pop")).toBe("K-pop");
  });
});
