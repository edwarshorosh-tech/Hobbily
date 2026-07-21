import { normalizePublicProfile } from "../utils/normalizePublicProfile";

describe("normalizePublicProfile", () => {
  it("regression: a legacy doc with no hobbies field never yields undefined — this is what crashed UserCardSheet's `profile.hobbies.length`", () => {
    const profile = normalizePublicProfile("uid1", { username: "nadav" });
    expect(profile.hobbies).toEqual([]);
    expect(() => profile.hobbies.length).not.toThrow();
  });

  it("handles a completely missing document (getDoc returned .exists() === false-shaped undefined data)", () => {
    const profile = normalizePublicProfile("uid1", undefined);
    expect(profile).toEqual({
      uid: "uid1",
      username: "",
      usernameNormalized: "",
      city: "",
      avatarUrl: null,
      currentStreak: 0,
      bio: "",
      hobbies: [],
      updatedAt: null,
    });
  });

  it("passes through well-formed data unchanged", () => {
    const profile = normalizePublicProfile("uid1", {
      username: "nadav",
      usernameNormalized: "nadav",
      city: "Tel Aviv",
      avatarUrl: "https://example.com/a.jpg",
      currentStreak: 5,
      bio: "hi",
      hobbies: ["chess", "guitar"],
    });
    expect(profile.username).toBe("nadav");
    expect(profile.hobbies).toEqual(["chess", "guitar"]);
    expect(profile.currentStreak).toBe(5);
  });

  it("drops non-string entries from a corrupted hobbies array instead of crashing downstream renderers", () => {
    const profile = normalizePublicProfile("uid1", { hobbies: ["chess", 42, null, "guitar"] });
    expect(profile.hobbies).toEqual(["chess", "guitar"]);
  });

  it("treats a non-array hobbies field (e.g. a stray string) as empty rather than propagating a wrong type", () => {
    const profile = normalizePublicProfile("uid1", { hobbies: "chess" as unknown });
    expect(profile.hobbies).toEqual([]);
  });

  it("treats an empty-string avatarUrl the same as null (no broken-image src)", () => {
    const profile = normalizePublicProfile("uid1", { avatarUrl: "" });
    expect(profile.avatarUrl).toBeNull();
  });

  it("falls back currentStreak to 0 for a missing or non-numeric value", () => {
    expect(normalizePublicProfile("uid1", {}).currentStreak).toBe(0);
    expect(normalizePublicProfile("uid1", { currentStreak: "5" as unknown }).currentStreak).toBe(0);
    expect(normalizePublicProfile("uid1", { currentStreak: NaN }).currentStreak).toBe(0);
  });
});
