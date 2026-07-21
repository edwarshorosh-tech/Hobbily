/**
 * The single canonical achievement catalog — every achievement id/condition
 * that exists in the app. Previously duplicated by hand between
 * ProgressContext.tsx (with check()) and app/(tabs)/profile.tsx (without),
 * which is exactly the kind of copy that quietly drifts; both now import
 * this file instead. IDs/titles/descriptions/icons/conditions are the same
 * seven that already existed — this pass doesn't invent replacement
 * conditions, only gives them one home plus a progress() function so a
 * locked achievement's detail sheet can show "7 / 10 sessions" instead of
 * just a lock icon.
 */
import { ProgressState } from "../types/Progress";

export type AchievementCategory = "sessions" | "streak" | "time";

export type AchievementProgress = { current: number; target: number };

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  /** Shown in the detail sheet under "How to earn this". */
  howToEarn: string;
  icon: string; // Ionicons name
  category: AchievementCategory;
  check: (state: ProgressState & { currentStreak: number }) => boolean;
  progress: (state: ProgressState & { currentStreak: number }) => AchievementProgress;
};

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: "first_session",
    title: "First Step",
    description: "Complete your first session",
    howToEarn: "Log any hobby session in the Planner.",
    icon: "footsteps-outline",
    category: "sessions",
    check: (s) => s.totalSessions >= 1,
    progress: (s) => ({ current: Math.min(s.totalSessions, 1), target: 1 }),
  },
  {
    id: "streak_3",
    title: "3-Day Streak",
    description: "Practice 3 days in a row",
    howToEarn: "Complete at least one session on 3 consecutive days.",
    icon: "flame-outline",
    category: "streak",
    check: (s) => s.currentStreak >= 3,
    progress: (s) => ({ current: Math.min(s.currentStreak, 3), target: 3 }),
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "7-day streak!",
    howToEarn: "Complete at least one session on 7 consecutive days.",
    icon: "trophy-outline",
    category: "streak",
    check: (s) => s.currentStreak >= 7,
    progress: (s) => ({ current: Math.min(s.currentStreak, 7), target: 7 }),
  },
  {
    id: "sessions_10",
    title: "Dedicated",
    description: "Complete 10 sessions",
    howToEarn: "Log 10 hobby sessions in total.",
    icon: "star-outline",
    category: "sessions",
    check: (s) => s.totalSessions >= 10,
    progress: (s) => ({ current: Math.min(s.totalSessions, 10), target: 10 }),
  },
  {
    id: "minutes_300",
    title: "Five Hours",
    description: "5+ hours of practice total",
    howToEarn: "Log 300 total minutes of practice across all sessions.",
    icon: "time-outline",
    category: "time",
    check: (s) => s.totalMinutes >= 300,
    progress: (s) => ({ current: Math.min(s.totalMinutes, 300), target: 300 }),
  },
  {
    id: "streak_30",
    title: "Month Master",
    description: "30-day streak!",
    howToEarn: "Complete at least one session on 30 consecutive days.",
    icon: "medal-outline",
    category: "streak",
    check: (s) => s.currentStreak >= 30,
    progress: (s) => ({ current: Math.min(s.currentStreak, 30), target: 30 }),
  },
  {
    id: "sessions_50",
    title: "Committed",
    description: "Complete 50 sessions",
    howToEarn: "Log 50 hobby sessions in total.",
    icon: "ribbon-outline",
    category: "sessions",
    check: (s) => s.totalSessions >= 50,
    progress: (s) => ({ current: Math.min(s.totalSessions, 50), target: 50 }),
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENT_DEFS.map((d) => d.id);

export function achievementDefById(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((d) => d.id === id);
}

/** Featured achievements are capped at 3 — enough to be a highlight, not a second badge grid. */
export const MAX_FEATURED_ACHIEVEMENTS = 3;
