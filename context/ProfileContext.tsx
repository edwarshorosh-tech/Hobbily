import { createContext, useContext, useState, useEffect } from "react";
import { Profile } from "../types/Profile";
import {
  loadProfile,
  saveProfile as persistProfile,
  ensurePublicProfileFresh,
  updateAvatarUrl,
} from "../services/profileService";
import { useAuth } from "./AuthContext";

const DEFAULT_PROFILE: Profile = {
  username: "explorer",
  email: "",
  age: "",
  bio: "",
  hobbies: [],
  avatarUrl: null,
  preferredCity: "",
  city: "",
  freeTimePerDay: "30-60",
  hasOnboarded: false,
  savedOpportunities: [],
};

type ProfileContextType = {
  profile: Profile;
  /** True once the profile has been loaded from Firestore (or determined no user) */
  isLoaded: boolean;
  saveProfile: (updated: Profile) => Promise<void>;
  /** Applies immediately (not part of the Settings draft/save flow) — used after avatar upload/removal. */
  updateAvatar: (avatarUrl: string | null) => Promise<void>;
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

  async function saveProfile(updated: Profile) {
    setProfile(updated);
    if (user) await persistProfile(user.uid, updated);
  }

  async function updateAvatar(avatarUrl: string | null) {
    if (!user) return;
    await updateAvatarUrl(user.uid, avatarUrl);
    setProfile((p) => ({ ...p, avatarUrl }));
  }

  return (
    <ProfileContext.Provider value={{ profile, isLoaded, saveProfile, updateAvatar }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
