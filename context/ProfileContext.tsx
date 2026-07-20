import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Profile, ThemePreference } from "../types/Profile";
import {
  DEFAULT_PROFILE,
  loadProfile,
  saveProfile as persistProfile,
  ensurePublicProfileFresh,
  updateAvatarUrl,
  updateThemePreference as persistThemePreference,
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

  const value = useMemo(
    () => ({ profile, isLoaded, saveProfile, updateAvatar, updateThemePreference }),
    [profile, isLoaded, saveProfile, updateAvatar, updateThemePreference]
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
