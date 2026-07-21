/**
 * Pure "initials fallback" logic for FriendAvatar, kept in its own
 * dependency-free module — components/friends/FriendAvatar.tsx imports
 * context/ThemeContext.tsx (for the ColorTokens type), which itself imports
 * AuthContext/ProfileContext and transitively lib/firebase.ts's real
 * Firebase initialization. A unit test for "what letters show up when
 * there's no photo" should never need to trigger any of that.
 */
export function initialsFor(username: string): string {
  const trimmed = (username || "?").trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
