import { initialsFor } from "../utils/avatarInitials";

describe("initialsFor (avatar fallback)", () => {
  it("uses the first letter for a one-word name", () => {
    expect(initialsFor("Nadav")).toBe("N");
  });

  it("uses the first letter of each of the first two words for a multi-word name", () => {
    expect(initialsFor("Nadav Cohen")).toBe("NC");
  });

  it("caps at two letters even for many words", () => {
    expect(initialsFor("Nadav Ben Cohen Levi")).toBe("NB");
  });

  it("falls back to '?' for empty or whitespace-only input", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });

  it("always uppercases the result", () => {
    expect(initialsFor("nadav cohen")).toBe("NC");
  });

  it("handles unicode names", () => {
    expect(initialsFor("נדב כהן")).toBe("נכ");
  });
});
