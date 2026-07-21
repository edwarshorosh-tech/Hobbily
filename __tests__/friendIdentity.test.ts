import { normalizeUsername, generateFriendshipPairId } from "../utils/friendIdentity";

describe("normalizeUsername", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeUsername("  Nadav  ")).toBe("nadav");
  });

  it("lowercases according to the app's single normalization rule", () => {
    expect(normalizeUsername("NaDaV")).toBe("nadav");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(normalizeUsername("")).toBe("");
    expect(normalizeUsername("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeUsername("  MixedCase  ");
    expect(normalizeUsername(once)).toBe(once);
  });
});

describe("generateFriendshipPairId", () => {
  it("is order-independent — the same pair produces the same id either way round", () => {
    expect(generateFriendshipPairId("uidA", "uidB")).toBe(generateFriendshipPairId("uidB", "uidA"));
  });

  it("joins the lexicographically-sorted uids with an underscore", () => {
    expect(generateFriendshipPairId("zzz", "aaa")).toBe("aaa_zzz");
  });
});
