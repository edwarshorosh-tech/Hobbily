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
  /** Up to MAX_FEATURED_ACHIEVEMENTS achievement ids this user chose to highlight — see constants/achievements.ts. */
  featuredAchievementIds: string[];
  /** Null whenever the quiz hasn't been completed OR the user has showPersonalityType off — never mirrored here unless the user opted in, so a hidden result never leaks its existence to other users. */
  personalityTypeId: string | null;
  personalityTypeName: string | null;
  updatedAt: Timestamp | null;
};
