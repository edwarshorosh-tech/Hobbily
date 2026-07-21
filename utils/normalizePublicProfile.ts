import { PublicProfile } from "../types/PublicProfile";

/**
 * The single normalization boundary for publicProfiles/{uid} documents.
 *
 * Every caller that turns a raw Firestore doc into a `PublicProfile`
 * (searchUserByUsername, getUserCard, fetchPublicProfilesByIds — see
 * services/friendsService.ts) must go through this function instead of
 * `{ uid, ...snap.data() } as PublicProfile`. A raw Firestore cast is a lie:
 * it tells TypeScript every field is present when Firestore never enforces
 * that at read time. Older profiles, Google-created profiles, profiles from
 * before `bio`/`hobbies` existed on publicProfiles, and partially migrated
 * documents can all be missing fields outright — that mismatch is exactly
 * what crashed UserCardSheet (`profile.hobbies.length` on a doc with no
 * `hobbies` field at all). Normalizing once here means every consumer
 * (UserCardSheet, FriendsSection, FriendsLeaderboard, FriendSearchModal,
 * PostCard/Post Detail/community chat via useAuthorProfiles) can trust the
 * shape unconditionally instead of each scattering its own `?.`/`|| []`.
 */
export function normalizePublicProfile(uid: string, data: Record<string, unknown> | undefined | null): PublicProfile {
  const d = data ?? {};
  const avatarUrl = d.avatarUrl;
  return {
    uid,
    username: typeof d.username === "string" ? d.username : "",
    usernameNormalized: typeof d.usernameNormalized === "string" ? d.usernameNormalized : "",
    city: typeof d.city === "string" ? d.city : "",
    avatarUrl: typeof avatarUrl === "string" && avatarUrl.length > 0 ? avatarUrl : null,
    currentStreak: typeof d.currentStreak === "number" && Number.isFinite(d.currentStreak) ? d.currentStreak : 0,
    bio: typeof d.bio === "string" ? d.bio : "",
    hobbies: Array.isArray(d.hobbies) ? d.hobbies.filter((h): h is string => typeof h === "string") : [],
    featuredAchievementIds: Array.isArray(d.featuredAchievementIds)
      ? d.featuredAchievementIds.filter((h): h is string => typeof h === "string")
      : [],
    personalityTypeId: typeof d.personalityTypeId === "string" ? d.personalityTypeId : null,
    personalityTypeName: typeof d.personalityTypeName === "string" ? d.personalityTypeName : null,
    updatedAt: (d.updatedAt as PublicProfile["updatedAt"]) ?? null,
  };
}
