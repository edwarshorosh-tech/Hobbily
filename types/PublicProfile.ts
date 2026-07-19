import { Timestamp } from "firebase/firestore";

/**
 * publicProfiles/{uid}
 * The safe-to-read-by-anyone subset of a user's profile. Kept in sync with
 * users/{uid} (username/city, via ProfileContext) and progress/{uid}
 * (currentStreak, via ProgressContext) — never edited directly.
 */
export type PublicProfile = {
  uid: string;
  username: string;
  usernameNormalized: string;
  city: string;
  avatarUrl: string | null;
  currentStreak: number;
  updatedAt: Timestamp | null;
};
