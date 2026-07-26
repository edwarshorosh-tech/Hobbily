/**
 * ProgressContext
 * Tracks streaks, total sessions, total practice minutes, and achievements.
 * All data persisted to Firestore at progress/{uid}.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { Achievement, ProgressState } from "../types/Progress";
import { ACHIEVEMENT_DEFS } from "../constants/achievements";
import { useAuth } from "./AuthContext";
import { db } from "../lib/firebase";
import { buildNotificationPayload, notificationsCollection } from "../services/notificationsService";
import { addDaysISO, localDateISO, startOfWeekISO } from "../utils/dateUtils";

// ── Streak computation ────────────────────────────────────────────────────────
// Local-calendar-day based (see utils/dateUtils.ts) — never UTC-shifted, so an
// activity logged late in the evening is never silently attributed to the
// wrong day for the user's actual timezone.

function todayISO() { return localDateISO(); }
function offsetISO(days: number) { return addDaysISO(todayISO(), days); }

function computeCurrentStreak(streakDays: string[], freezeUsed?: string | null): number {
  if (streakDays.length === 0) return 0;
  const set = new Set(streakDays);
  const today = todayISO();
  const yesterday = offsetISO(-1);
  const startDate = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  if (!startDate) return 0;
  let count = 0;
  let check = startDate;
  for (let i = 0; i < 366; i++) {
    if (set.has(check)) {
      count++;
    } else if (i === 0 && freezeUsed === today) {
      count++;
    } else {
      break;
    }
    check = addDaysISO(check, -1);
  }
  return count;
}

function getThisMonday(): string {
  return startOfWeekISO(todayISO());
}

// ── Context type ──────────────────────────────────────────────────────────────

type ProgressContextType = {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  totalMinutes: number;
  achievements: Achievement[];
  streakFreezeAvailable: boolean;
  /** Oldest → newest, 7 entries, whether each of the last 7 calendar days had a completed session. */
  recentActivity: { date: string; active: boolean }[];
  /** True once the initial progress/{uid} load has settled (success or failure). */
  isLoaded: boolean;
  /** Set when the initial load failed (e.g. offline) — cleared on the next successful load. */
  loadError: string | null;
  recordSession: (minutes: number) => Promise<void>;
  useStreakFreeze: () => Promise<void>;
  /** Achievements unlocked since this provider mounted (not on cold-start load) — drives a one-time celebration toast. Consume via clearJustUnlocked(). */
  justUnlocked: Achievement[];
  clearJustUnlocked: () => void;
};

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

const DEFAULT_STATE: ProgressState = {
  streakDays: [],
  totalSessions: 0,
  totalMinutes: 0,
  longestStreak: 0,
  achievements: [],
  streakFreezeAvailable: true,
  streakFreezeLastGranted: "",
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthLoaded } = useAuth();
  const [state, setState] = useState<ProgressState>(DEFAULT_STATE);
  const [freezeUsedDate, setFreezeUsedDate] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<Achievement[]>([]);
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (!isAuthLoaded || !user) {
      setState(DEFAULT_STATE);
      setFreezeUsedDate(null);
      setIsLoaded(!!isAuthLoaded);
      setLoadError(null);
      reconciledRef.current = false;
      return;
    }
    let cancelled = false;
    setIsLoaded(false);
    setLoadError(null);
    reconciledRef.current = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "progress", user.uid));
        if (cancelled) return;
        if (snap.exists()) {
          const parsed = snap.data();
          setState({ ...DEFAULT_STATE, ...parsed.state });
          setFreezeUsedDate(parsed.freezeUsedDate ?? null);
        }
      } catch (e) {
        // Most commonly a temporary offline/connectivity failure (see lib/firebase.ts).
        // Keep DEFAULT_STATE — the next recordSession()/useStreakFreeze() call
        // reconciles with Firestore once connectivity returns.
        if (__DEV__) console.warn("[ProgressContext] failed to load progress", e);
        if (!cancelled) setLoadError("Network error — please try again.");
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAuthLoaded]);

  /**
   * Persists the progress doc and, when achievements were just earned, writes
   * one notification per achievement in the same batch — one Firestore round
   * trip, and the notification can never exist without the progress update
   * that earned it actually having been saved.
   */
  async function persist(newState: ProgressState, newFreeze: string | null, newlyEarned: Achievement[] = []) {
    setState(newState);
    setFreezeUsedDate(newFreeze);
    if (newlyEarned.length > 0) setJustUnlocked((prev) => [...prev, ...newlyEarned]);
    if (!user) return;

    const batch = writeBatch(db);
    batch.set(
      doc(db, "progress", user.uid),
      {
        // achievementIds mirrors achievements' ids as a flat string list —
        // Firestore security rules can't easily project ".id" out of a list
        // of maps, so this flat mirror is what lets firestore.rules verify a
        // publicProfiles.featuredAchievementIds selection is actually a
        // subset of what this user has really unlocked.
        state: { ...newState, achievementIds: newState.achievements.map((a) => a.id) },
        freezeUsedDate: newFreeze,
      },
      { merge: true }
    );
    newlyEarned.forEach((achievement) => {
      batch.set(
        doc(notificationsCollection(user.uid)),
        buildNotificationPayload({
          recipientId: user.uid,
          type: "achievement_unlocked",
          title: "Achievement unlocked",
          body: `${achievement.title} — ${achievement.description}`,
          actorId: user.uid,
          entityId: achievement.id,
          route: { screen: "profile_badges" },
        })
      );
    });
    await batch.commit();
  }

  const currentStreak = computeCurrentStreak(state.streakDays, freezeUsedDate);

  const recentActivity = useMemo(() => {
    const set = new Set(state.streakDays);
    const days: { date: string; active: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const iso = offsetISO(-i);
      days.push({ date: iso, active: set.has(iso) });
    }
    return days;
  }, [state.streakDays]);

  // Mirror the computed streak into publicProfiles/{uid} so friends can read it
  // without accessing this user's private progress document. This is the same
  // client-trusted write path progress data already uses — see the security
  // note in firestore.rules for the limitation this implies.
  //
  // Gated on isLoaded && !loadError: `state` starts at DEFAULT_STATE (empty
  // streakDays, currentStreak 0) on every mount/reload, before the real
  // progress/{uid} doc has actually been fetched. Without this guard, that
  // transient 0 got written to publicProfiles immediately — normally
  // harmless (the real value overwrites it a moment later once the load
  // resolves), but on a failed load (offline, the network hiccups this
  // project's own lib/firebase.ts already documents), that correction never
  // comes — a real streak could get permanently reported as 0 to friends
  // from one transient network failure.
  useEffect(() => {
    if (!user || !isLoaded || loadError) return;
    setDoc(
      doc(db, "publicProfiles", user.uid),
      { currentStreak, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((e) => {
      if (__DEV__) console.warn("[ProgressContext] streak mirror failed", e);
    });
  }, [user, currentStreak, isLoaded, loadError]);

  function checkAchievements(s: ProgressState, streak: number): Achievement[] {
    const combined = { ...s, currentStreak: streak };
    const earned = new Set(s.achievements.map((a) => a.id));
    const newOnes: Achievement[] = [];
    for (const def of ACHIEVEMENT_DEFS) {
      if (!earned.has(def.id) && def.check(combined)) {
        newOnes.push({ id: def.id, title: def.title, description: def.description, icon: def.icon, earnedAt: todayISO() });
      }
    }
    return newOnes;
  }

  // Reconciliation: recordSession() re-checks every achievement def, not just
  // the one that changed, so a user who crosses several thresholds in one
  // session already gets all of them at once. The gap that leaves is anyone
  // who qualifies *without* a new recordSession call happening — e.g. a
  // streak achievement whose window advanced purely by calendar time, or an
  // achievement def that didn't exist yet when they first crossed its
  // threshold. Running the same check once per load (against the freshly
  // loaded state, not tied to any user action) closes that gap without a
  // database scan — it's a single doc this user already owns.
  useEffect(() => {
    // loadError means the fetch above failed and `state` is still sitting at
    // DEFAULT_STATE (empty achievements/streakDays/totals) — NOT a confirmed
    // "this account genuinely has nothing yet". Reconciling (and persisting)
    // against that would write the empty defaults back over whatever real
    // progress already exists in Firestore. Skipping here means reconciling
    // simply waits for the next successful load (the top load-effect resets
    // both loadError and reconciledRef whenever `user`/`isAuthLoaded`
    // changes) instead of overwriting real data with a network hiccup.
    if (!isLoaded || !user || loadError || reconciledRef.current) return;
    reconciledRef.current = true;
    const newlyEarned = checkAchievements(state, currentStreak);
    const updatedAchievements = newlyEarned.length > 0 ? [...state.achievements, ...newlyEarned] : state.achievements;
    // Always re-persists (even with zero newly-earned) so state.achievementIds
    // — the flat mirror firestore.rules uses to verify featuredAchievementIds
    // — gets backfilled for every existing account on their first load after
    // this field was introduced, not only for users who unlock something new.
    persist({ ...state, achievements: updatedAchievements }, freezeUsedDate, newlyEarned).catch((e) => {
      if (__DEV__) console.warn("[ProgressContext] achievement reconciliation failed", e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user, loadError]);

  const recordSession = useCallback(async (minutes: number) => {
    const today = todayISO();
    const newDays = state.streakDays.includes(today)
      ? state.streakDays
      : [...state.streakDays, today];

    const newTotalSessions = state.totalSessions + 1;
    const newTotalMinutes = state.totalMinutes + minutes;

    const monday = getThisMonday();
    const freezeAvailable = state.streakFreezeLastGranted !== monday ? true : state.streakFreezeAvailable;

    const newStreak = computeCurrentStreak(newDays, freezeUsedDate);
    const newLongest = Math.max(state.longestStreak, newStreak);
    const newAchievements = checkAchievements(
      { ...state, streakDays: newDays, totalSessions: newTotalSessions, totalMinutes: newTotalMinutes, longestStreak: newLongest, streakFreezeAvailable: freezeAvailable },
      newStreak
    );

    const updated: ProgressState = {
      ...state,
      streakDays: newDays,
      totalSessions: newTotalSessions,
      totalMinutes: newTotalMinutes,
      longestStreak: newLongest,
      achievements: [...state.achievements, ...newAchievements],
      streakFreezeAvailable: freezeAvailable,
      streakFreezeLastGranted: freezeAvailable && state.streakFreezeLastGranted !== monday ? monday : state.streakFreezeLastGranted,
    };

    await persist(updated, freezeUsedDate, newAchievements);
  }, [state, freezeUsedDate]);

  const useStreakFreeze = useCallback(async () => {
    if (!state.streakFreezeAvailable) return;
    const updated: ProgressState = { ...state, streakFreezeAvailable: false };
    await persist(updated, todayISO());
  }, [state]);

  const clearJustUnlocked = useCallback(() => setJustUnlocked([]), []);

  const value = useMemo(
    () => ({
      currentStreak,
      longestStreak: state.longestStreak,
      totalSessions: state.totalSessions,
      totalMinutes: state.totalMinutes,
      achievements: state.achievements,
      streakFreezeAvailable: state.streakFreezeAvailable,
      recentActivity,
      isLoaded,
      loadError,
      recordSession,
      useStreakFreeze,
      justUnlocked,
      clearJustUnlocked,
    }),
    [
      currentStreak,
      state.longestStreak,
      state.totalSessions,
      state.totalMinutes,
      state.achievements,
      justUnlocked,
      clearJustUnlocked,
      state.streakFreezeAvailable,
      recentActivity,
      isLoaded,
      loadError,
      recordSession,
      useStreakFreeze,
    ]
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside ProgressProvider");
  return ctx;
}
