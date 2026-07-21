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
  /** Short public bio — safe to show on any user's card (UserCardSheet). Never age, exact location, or email; those stay private to users/{uid}. */
  bio: string;
  /** Selected hobby tags — safe to show publicly, same list the user already sees on their own profile. */
  hobbies: string[];
  updatedAt: Timestamp | null;
};
