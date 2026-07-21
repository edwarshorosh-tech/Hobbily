export type FreeTimePerDay = "<30" | "30-60" | "1-2h" | "2h+";

/** The authenticated app's light/dark mode — see context/ThemeContext.tsx for the full initialization/priority rules. */
export type ThemePreference = "light" | "dark";

export type Profile = {
  username: string;
  email: string;
  /** Stored as a string to match text input state; validated as a number on save */
  age: string;
  bio: string;
  /** List of hobby tags displayed on the profile and used to tag posts */
  hobbies: string[];
  /** Firebase Storage download URL for the user's profile picture, or null for the initials fallback */
  avatarUrl: string | null;
  /** Last city the user selected in the WeatherBox */
  preferredCity: string;
  city: string;
  /** Settlement code from the israel-geolocation dataset (utils/israeliLocalities.ts) when city was chosen from the search results, null for a custom-typed or legacy value. */
  localityId: string | null;
  /** null = legacy profile from before this field existed — never fabricated for old data. */
  locationSource: "official" | "custom" | null;
  freeTimePerDay: FreeTimePerDay;
  hasOnboarded: boolean;
  /** IDs of saved/bookmarked opportunities */
  savedOpportunities: string[];
  /** null = user has never explicitly chosen a theme on any device — ThemeContext falls back to light. */
  themePreference: ThemePreference | null;
  /** Up to MAX_FEATURED_ACHIEVEMENTS unlocked achievement ids, shown as highlights on the profile/UserCardSheet. Mirrored into publicProfiles/{uid} so other users can see them. */
  featuredAchievementIds: string[];
  /** Keyed by `${disclaimerId}_v${version}` (see constants/disclaimers.ts) → ISO dismissal date. A disclaimer whose version is bumped gets a fresh key, so it reappears even for users who dismissed an older version. */
  dismissedDisclaimers: Record<string, string>;
  /** Hidden Hobbies Quiz result — see utils/quizScoring.ts. Null until the quiz is completed at least once. Only the derived result is stored, never the raw 15 answers. */
  personalityTypeId: string | null;
  personalityTypeName: string | null;
  quizCompletedAt: string | null;
  /** Bumped only if the archetype/scoring logic changes in a way that invalidates old results. */
  quizVersion: number;
  /** Defaults to false — the user must opt in via Settings before personalityTypeName is mirrored to publicProfiles/{uid}. */
  showPersonalityType: boolean;
};
