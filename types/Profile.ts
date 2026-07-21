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
  freeTimePerDay: FreeTimePerDay;
  hasOnboarded: boolean;
  /** IDs of saved/bookmarked opportunities */
  savedOpportunities: string[];
  /** null = user has never explicitly chosen a theme on any device — ThemeContext falls back to light. */
  themePreference: ThemePreference | null;
};
