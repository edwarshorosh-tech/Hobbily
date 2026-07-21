import { ACHIEVEMENT_DEFS, achievementDefById, ACHIEVEMENT_IDS, MAX_FEATURED_ACHIEVEMENTS } from "../constants/achievements";

const baseState = {
  streakDays: [],
  totalSessions: 0,
  totalMinutes: 0,
  longestStreak: 0,
  achievements: [],
  streakFreezeAvailable: true,
  streakFreezeLastGranted: "",
  currentStreak: 0,
};

describe("achievement catalog", () => {
  it("has exactly the seven pre-existing achievement ids, unchanged by the catalog consolidation", () => {
    expect(ACHIEVEMENT_IDS.sort()).toEqual(
      ["first_session", "streak_3", "streak_7", "sessions_10", "minutes_300", "streak_30", "sessions_50"].sort()
    );
  });

  it("achievementDefById finds a real def and returns undefined for an unknown id", () => {
    expect(achievementDefById("streak_7")?.title).toBe("Week Warrior");
    expect(achievementDefById("does_not_exist")).toBeUndefined();
  });

  it("every check() is false for the zeroed baseline state", () => {
    for (const def of ACHIEVEMENT_DEFS) {
      expect(def.check(baseState)).toBe(false);
    }
  });

  it("sessions_10 unlocks at exactly 10 total sessions, not before", () => {
    const def = achievementDefById("sessions_10")!;
    expect(def.check({ ...baseState, totalSessions: 9 })).toBe(false);
    expect(def.check({ ...baseState, totalSessions: 10 })).toBe(true);
  });

  it("streak_30 tracks currentStreak, not longestStreak", () => {
    const def = achievementDefById("streak_30")!;
    expect(def.check({ ...baseState, longestStreak: 30, currentStreak: 5 })).toBe(false);
    expect(def.check({ ...baseState, currentStreak: 30 })).toBe(true);
  });

  it("progress() clamps current to target so a detail sheet never shows e.g. 12/10", () => {
    const def = achievementDefById("sessions_10")!;
    expect(def.progress({ ...baseState, totalSessions: 25 })).toEqual({ current: 10, target: 10 });
    expect(def.progress({ ...baseState, totalSessions: 4 })).toEqual({ current: 4, target: 10 });
  });

  it("MAX_FEATURED_ACHIEVEMENTS is a small, sane cap", () => {
    expect(MAX_FEATURED_ACHIEVEMENTS).toBeGreaterThan(0);
    expect(MAX_FEATURED_ACHIEVEMENTS).toBeLessThanOrEqual(5);
  });
});
