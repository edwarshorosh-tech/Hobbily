import { rankFriendRecommendations, scoreRecommendation } from "../utils/friendRecommendations";
import { PublicProfile } from "../types/PublicProfile";

function profile(overrides: Partial<PublicProfile> & { uid: string }): PublicProfile {
  return {
    username: overrides.uid,
    usernameNormalized: overrides.uid,
    city: "",
    avatarUrl: null,
    currentStreak: 0,
    bio: "",
    hobbies: [],
    featuredAchievementIds: [],
    personalityTypeId: null,
    personalityTypeName: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("scoreRecommendation", () => {
  it("awards 2 points per shared hobby", () => {
    const p = profile({ uid: "a", hobbies: ["Chess", "Painting"] });
    expect(scoreRecommendation(p, new Set(["chess", "painting"]), "")).toBe(4);
    expect(scoreRecommendation(p, new Set(["chess"]), "")).toBe(2);
    expect(scoreRecommendation(p, new Set(["hiking"]), "")).toBe(0);
  });

  it("awards 1 point for a matching city, case-insensitively", () => {
    const p = profile({ uid: "a", city: "Tel Aviv" });
    expect(scoreRecommendation(p, new Set(), "tel aviv")).toBe(1);
    expect(scoreRecommendation(p, new Set(), "haifa")).toBe(0);
    expect(scoreRecommendation(p, new Set(), "")).toBe(0);
  });

  it("combines hobby and city points", () => {
    const p = profile({ uid: "a", hobbies: ["Chess"], city: "Haifa" });
    expect(scoreRecommendation(p, new Set(["chess"]), "haifa")).toBe(3);
  });
});

describe("rankFriendRecommendations", () => {
  const me = "me";

  it("excludes the current user", () => {
    const result = rankFriendRecommendations([profile({ uid: me }), profile({ uid: "other" })], me, new Set(), [], "", 12);
    expect(result.map((p) => p.uid)).toEqual(["other"]);
  });

  it("excludes every uid in excludeUids (accepted friends + incoming + outgoing pending, whatever the caller put there)", () => {
    const candidates = [profile({ uid: "friend" }), profile({ uid: "pending-in" }), profile({ uid: "pending-out" }), profile({ uid: "stranger" })];
    const result = rankFriendRecommendations(candidates, me, new Set(["friend", "pending-in", "pending-out"]), [], "", 12);
    expect(result.map((p) => p.uid)).toEqual(["stranger"]);
  });

  it("ranks best-match-first by combined hobby + city score", () => {
    const noMatch = profile({ uid: "no-match" });
    const cityOnly = profile({ uid: "city-only", city: "Haifa" });
    const hobbyAndCity = profile({ uid: "hobby-and-city", city: "Haifa", hobbies: ["Chess"] });
    const result = rankFriendRecommendations(
      [noMatch, cityOnly, hobbyAndCity],
      me,
      new Set(),
      ["Chess"],
      "Haifa",
      12
    );
    expect(result.map((p) => p.uid)).toEqual(["hobby-and-city", "city-only", "no-match"]);
  });

  it("caps the result at pageSize even when more candidates match", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => profile({ uid: `u${i}` }));
    const result = rankFriendRecommendations(candidates, me, new Set(), [], "", 5);
    expect(result).toHaveLength(5);
  });

  it("preserves relative order among equally-scored candidates (stable sort)", () => {
    const candidates = [profile({ uid: "first" }), profile({ uid: "second" }), profile({ uid: "third" })];
    const result = rankFriendRecommendations(candidates, me, new Set(), [], "", 12);
    expect(result.map((p) => p.uid)).toEqual(["first", "second", "third"]);
  });
});
