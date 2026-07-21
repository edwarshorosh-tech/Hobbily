import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Profile, ThemePreference } from "../types/Profile";
import {
  DEFAULT_PROFILE,
  loadProfile,
  saveProfile as persistProfile,
  ensurePublicProfileFresh,
  updateAvatarUrl,
  updateThemePreference as persistThemePreference,
  saveQuizResult as persistQuizResult,
  updatePersonalityVisibility as persistPersonalityVisibility,
  dismissDisclaimer as persistDisclaimerDismissed,
} from "../services/profileService";
import { useAuth } from "./AuthContext";

type ProfileContextType = {
  profile: Profile;
  /** True once the profile has been loaded from Firestore (or determined no user) */
  isLoaded: boolean;
  saveProfile: (updated: Profile) => Promise<void>;
  /** Applies immediately (not part of the Settings draft/save flow) — used after avatar upload/removal. */
  updateAvatar: (avatarUrl: string | null) => Promise<void>;
  /** Applies immediately — used by ThemeContext when the user changes their theme. Updates local state right away and syncs to Firestore in the background (never blocks the UI, and is a no-op when signed out). */
  updateThemePreference: (pref: ThemePreference) => void;
  /** Persists a freshly-computed quiz result. Throws on failure — the quiz screen keeps the user's answers and offers Retry rather than silently losing the result. */
  saveQuizResult: (result: { typeId: string; typeName: string; quizVersion: number }) => Promise<void>;
  /** Toggles whether personalityTypeName is visible to other users. Applies immediately, same pattern as updateAvatar. */
  updatePersonalityVisibility: (show: boolean) => Promise<void>;
  /** Marks a disclaimer (id+version key) dismissed — applies immediately locally so the on-screen queue advances without waiting for the round trip, and persists in the background. */
  dismissDisclaimer: (key: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthLoaded } = useAuth();
  const [profile, setProfile] = useState<Profile>({ ...DEFAULT_PROFILE });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (!user) {
      // No authenticated user — reset so auth gate redirects to onboarding
      setProfile({ ...DEFAULT_PROFILE });
      setIsLoaded(true);
      return;
    }
    let cancelled = false;
    setIsLoaded(false);
    (async () => {
      try {
        const p = await loadProfile(user.uid);
        if (cancelled) return;
        setProfile(p);
        // Best-effort backfill of publicProfiles/{uid} — never blocks the profile load.
        ensurePublicProfileFresh(user.uid, p).catch((e) => {
          if (__DEV__) console.warn("[ProfileContext] publicProfile backfill failed", e);
        });
      } catch (e) {
        // Most commonly a temporary offline/connectivity failure (see lib/firebase.ts).
        // Fall back to whatever profile state we already have instead of hanging
        // the app's splash gate forever — Firestore will resync once reachable.
        if (__DEV__) console.warn("[ProfileContext] failed to load profile", e);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAuthLoaded]);

  const saveProfile = useCallback(
    async (updated: Profile) => {
      setProfile(updated);
      if (user) await persistProfile(user.uid, updated);
    },
    [user]
  );

  const updateAvatar = useCallback(
    async (avatarUrl: string | null) => {
      if (!user) return;
      await updateAvatarUrl(user.uid, avatarUrl);
      setProfile((p) => ({ ...p, avatarUrl }));
    },
    [user]
  );

  const updateThemePreference = useCallback(
    (pref: ThemePreference) => {
      // Local state updates immediately regardless of auth state — a signed-
      // out user (or one mid-onboarding) can still have this called once
      // they authenticate; ThemeContext itself decides when to call it.
      setProfile((p) => (p.themePreference === pref ? p : { ...p, themePreference: pref }));
      if (!user) return;
      persistThemePreference(user.uid, pref).catch((e) => {
        if (__DEV__) console.warn("[ProfileContext] failed to sync theme preference", e);
      });
    },
    [user]
  );

  const saveQuizResult = useCallback(
    async (result: { typeId: string; typeName: string; quizVersion: number }) => {
      if (!user) return;
      await persistQuizResult(user.uid, result);
      setProfile((p) => ({ ...p, personalityTypeId: result.typeId, personalityTypeName: result.typeName, quizCompletedAt: new Date().toISOString(), quizVersion: result.quizVersion }));
    },
    [user]
  );

  const updatePersonalityVisibility = useCallback(
    async (show: boolean) => {
      if (!user) return;
      setProfile((p) => ({ ...p, showPersonalityType: show }));
      await persistPersonalityVisibility(user.uid, show, profile.personalityTypeId, profile.personalityTypeName);
    },
    [user, profile.personalityTypeId, profile.personalityTypeName]
  );

  const dismissDisclaimer = useCallback(
    async (key: string) => {
      setProfile((p) => ({ ...p, dismissedDisclaimers: { ...p.dismissedDisclaimers, [key]: new Date().toISOString() } }));
      if (!user) return;
      await persistDisclaimerDismissed(user.uid, key);
    },
    [user]
  );

  const value = useMemo(
    () => ({ profile, isLoaded, saveProfile, updateAvatar, updateThemePreference, saveQuizResult, updatePersonalityVisibility, dismissDisclaimer }),
    [profile, isLoaded, saveProfile, updateAvatar, updateThemePreference, saveQuizResult, updatePersonalityVisibility, dismissDisclaimer]
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
