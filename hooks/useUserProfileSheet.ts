import { useCallback, useState } from "react";

/**
 * The one shared "which user's profile sheet is open" controller. Every
 * screen that can open UserCardSheet (community chat, member list, Friends
 * section, posts/comments, workshop participant list) uses this instead of
 * its own ad-hoc `useState<string | null>` — not a single global instance
 * (each screen still owns its own open/close state, which is what keeps a
 * sheet closing on one screen from affecting another), but a single shared
 * shape/behavior so there's exactly one way "open this uid's profile" and
 * "close it" are expressed everywhere.
 *
 * openUserProfile/closeUserProfile are stable across renders (useCallback
 * with no deps), so passing them straight into a FlatList renderItem or a
 * memoized child never invalidates that child's memoization just because
 * the parent re-rendered for an unrelated reason.
 */
export function useUserProfileSheet() {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Guards against an empty/whitespace-only uid — every real caller passes a
  // genuine Firestore document id, but a blank string would otherwise still
  // flip UserCardSheet's `visible` to true (its check is just `uid !== null`)
  // and open a sheet with nothing to load.
  const openUserProfile = useCallback((uid: string) => {
    if (uid.trim().length === 0) return;
    setSelectedUid(uid);
  }, []);
  const closeUserProfile = useCallback(() => setSelectedUid(null), []);

  return { selectedUid, openUserProfile, closeUserProfile };
}
