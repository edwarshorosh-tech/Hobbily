import { validateCustomHobby, MIN_CUSTOM_HOBBY_LENGTH, MAX_CUSTOM_HOBBY_LENGTH } from "../utils/hobbyValidation";

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
    expect(validateCustomHobby("a".repeat(MIN_CUSTOM_HOBBY_LENGTH), [])).toBeNull();
  });

  it("rejects a value longer than the maximum length", () => {
    expect(validateCustomHobby("a".repeat(MAX_CUSTOM_HOBBY_LENGTH + 1), [])).not.toBeNull();
    expect(validateCustomHobby("a".repeat(MAX_CUSTOM_HOBBY_LENGTH), [])).toBeNull();
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
