/**
 * useAuthorProfiles — resolves avatar/display data for a set of author uids
 * (a feed page's post authors, a post's comment authors, ...) from
 * publicProfiles, batched via the same fetchPublicProfilesByIds already used
 * by FriendsContext — never a per-row subscription. Always reads the
 * *current* publicProfiles doc rather than trusting any avatarUrl a post or
 * comment might have captured at write time, so a user changing their photo
 * shows up everywhere on their next fetch instead of leaving old posts/
 * comments with a stale avatar (see Stage 16 — cross-screen consistency).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicProfile } from "../types/PublicProfile";
import { fetchPublicProfilesByIds } from "../services/friendsService";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../context/ProfileContext";

export function useAuthorProfiles(authorIds: (string | undefined)[]): Map<string, PublicProfile> {
  const [profiles, setProfiles] = useState<Map<string, PublicProfile>>(new Map());
  const fetchedKeyRef = useRef("");
  const { user } = useAuth();
  const { profile } = useProfile();

  const uniqueIds = Array.from(new Set(authorIds.filter((id): id is string => Boolean(id)))).sort();
  const key = uniqueIds.join(",");

  useEffect(() => {
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;
    if (uniqueIds.length === 0) {
      setProfiles(new Map());
      return;
    }
    let cancelled = false;
    fetchPublicProfilesByIds(uniqueIds)
      .then((fetched) => {
        if (!cancelled) setProfiles((prev) => new Map([...prev, ...fetched]));
      })
      .catch((e) => {
        if (__DEV__) console.warn("[useAuthorProfiles] fetch failed", e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The batched fetch above is a one-shot snapshot, not a live subscription
  // (deliberately — one listener per rendered card/comment would not scale).
  // That means if the *current* user edits their own avatar/username in
  // Settings while a feed/post/comments screen from an earlier fetch is
  // still mounted (Expo Router keeps tab screens mounted across switches),
  // their own posts/comments would keep showing the stale value until an
  // unrelated refetch happened to occur. ProfileContext is always fresh for
  // the signed-in user, so patch it in here as the single place every
  // consumer (PostCard, Post Detail, comments, community chat) reads from —
  // closing the "avatar update must appear everywhere without a restart"
  // requirement for the one case a live listener can't cheaply cover anyway.
  return useMemo(() => {
    if (!user || !profiles.has(user.uid)) return profiles;
    const existing = profiles.get(user.uid)!;
    if (existing.avatarUrl === profile.avatarUrl && existing.username === profile.username) return profiles;
    const merged = new Map(profiles);
    merged.set(user.uid, { ...existing, avatarUrl: profile.avatarUrl, username: profile.username });
    return merged;
  }, [profiles, user, profile.avatarUrl, profile.username]);
}
