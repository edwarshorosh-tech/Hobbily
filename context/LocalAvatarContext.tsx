/**
 * LocalAvatarContext — the current signed-in user's on-device-only avatar
 * (services/localAvatarService.ts), reactively available anywhere via
 * useLocalAvatar() so every screen showing the current user's own avatar
 * (Profile header, own post cards, etc. — see resolveAvatar()) updates the
 * instant a new photo is saved, without a manual refresh/invalidation of
 * anything else.
 *
 * Scoped strictly to the signed-in uid: switching accounts on the same
 * device swaps to that account's own local avatar (or none), never leaking
 * the previous account's photo. Logging out clears the in-memory value
 * immediately — the file itself stays on disk under the old uid's own
 * folder until that account signs back in (or is deleted, in which case
 * AuthContext's own account-deletion flow removes it explicitly).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { LocalAvatar, localAvatarStorage } from "../services/localAvatarService";

export type LocalAvatarErrorCode =
  | "not-authenticated"
  | "permission-denied"
  | "selection-cancelled"
  | "invalid-uri"
  | "processing-failed"
  | "unknown";

export class LocalAvatarError extends Error {
  code: LocalAvatarErrorCode;
  constructor(code: LocalAvatarErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LocalAvatarError";
    this.code = code;
  }
}

export function localAvatarErrorMessage(code: LocalAvatarErrorCode): string {
  switch (code) {
    case "not-authenticated":
      return "Please sign in again to update your photo.";
    case "permission-denied":
      return "Photo access was denied. Enable it in your device settings to add a profile picture.";
    case "invalid-uri":
      return "That photo couldn't be read. Please try a different one.";
    case "processing-failed":
      return "Couldn't process that photo. Please try a different one.";
    case "selection-cancelled":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
}

type LocalAvatarContextType = {
  /** null while loading or when none is set. */
  localAvatarUri: string | null;
  isLoading: boolean;
  isSaving: boolean;
  /** Processes + permanently saves the picked image as this device's local avatar for the current user. */
  saveFromPickedUri: (sourceUri: string) => Promise<void>;
  removeLocalAvatar: () => Promise<void>;
};

const LocalAvatarContext = createContext<LocalAvatarContextType | undefined>(undefined);

export function LocalAvatarProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<LocalAvatar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setAvatar(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    localAvatarStorage
      .getLocalAvatar(user.uid)
      .then((a) => { if (!cancelled) setAvatar(a); })
      .catch(() => { if (!cancelled) setAvatar(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveFromPickedUri = useCallback(
    async (sourceUri: string) => {
      if (!user) throw new LocalAvatarError("not-authenticated");
      if (!sourceUri) throw new LocalAvatarError("invalid-uri");
      setIsSaving(true);
      try {
        const saved = await localAvatarStorage.saveLocalAvatar(user.uid, sourceUri);
        setAvatar(saved);
      } catch (e) {
        throw new LocalAvatarError("processing-failed", e instanceof Error ? e.message : undefined);
      } finally {
        setIsSaving(false);
      }
    },
    [user]
  );

  const removeLocalAvatar = useCallback(async () => {
    if (!user) throw new LocalAvatarError("not-authenticated");
    setIsSaving(true);
    try {
      await localAvatarStorage.deleteLocalAvatar(user.uid);
      setAvatar(null);
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  const value = useMemo<LocalAvatarContextType>(
    () => ({ localAvatarUri: avatar?.fileUri ?? null, isLoading, isSaving, saveFromPickedUri, removeLocalAvatar }),
    [avatar, isLoading, isSaving, saveFromPickedUri, removeLocalAvatar]
  );

  return <LocalAvatarContext.Provider value={value}>{children}</LocalAvatarContext.Provider>;
}

export function useLocalAvatar() {
  const ctx = useContext(LocalAvatarContext);
  if (!ctx) throw new Error("useLocalAvatar must be used inside LocalAvatarProvider");
  return ctx;
}
