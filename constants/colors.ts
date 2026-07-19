/**
 * Centralized color system for Hobbily.
 *
 * Hobbily has two distinct visual experiences:
 *  - `onboardingTheme`  — the light onboarding/auth flow (app/onboarding.tsx).
 *    Fixed: always light, independent of the system color scheme or the
 *    in-app Dark Mode toggle, so first impressions are consistent for every
 *    tester regardless of device settings.
 *  - `lightTheme` / `darkTheme` — the authenticated app (tabs + everything
 *    inside them). Dark is the primary/default look; light is reachable via
 *    the "Dark Mode" toggle in Profile > Settings > Appearance.
 *
 * `brand` holds the handful of colors that mean the same thing everywhere
 * and don't change with theme (the streak flame, opportunity cost tags),
 * so they're defined once instead of re-typed as raw hex in half a dozen
 * files.
 *
 * Every screen/component should read colors from `useTheme()` (which wraps
 * `lightTheme`/`darkTheme`) or, for onboarding/auth, `onboardingTheme` —
 * never a raw hex literal.
 */

export type ColorTokens = {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  border: string;
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  success: string;
  tabBar: string;
  tabBarActive: string;
  tabBarInactive: string;
  inputBackground: string;
  /**
   * Medium blue for focus rings, links, and secondary interactive accents —
   * distinct from `primary` (reserved for main buttons/selected states) and
   * `accent` (coral, reserved for small highlights). Currently only defined
   * for the light onboarding/auth/quiz theme; optional so lightTheme/
   * darkTheme (the authenticated app) are untouched.
   */
  link?: string;
  /**
   * Background/text pair for "tinted" read-only chips (e.g. TagChip's
   * `variant="tinted"`, used for static interest/hobby pills). Kept as
   * separate tokens rather than deriving from `secondary`/`primary` so each
   * theme's existing values can stay exactly as they already render —
   * darkTheme's pair below reproduces its old hardcoded look pixel-for-pixel.
   */
  chipTintBg?: string;
  chipTintText?: string;
  chipTintBorder?: string;
};

export const lightTheme: ColorTokens = {
  background: "#CACEF2",
  card: "#DEE1F7",
  text: "#000000",
  secondaryText: "#3F4368",
  border: "#A9AEDD",
  primary: "#032068",
  secondary: "#B9BEEA",
  accent: "#FC7273",
  danger: "#FC7273",
  dangerBg: "#FDE2E2",
  dangerBorder: "#FBB5B5",
  success: "#0E9F6E",
  tabBar: "#DEE1F7",
  tabBarActive: "#032068",
  tabBarInactive: "#7379B0",
  inputBackground: "#DEE1F7",
  // Dark-navy-on-pale-blue — was white/near-white text on a faint translucent
  // blue tint (readable in dark mode, where the same overlay sits on a dark
  // card and reads as a saturated blue; in light mode the same overlay over
  // a pale card produced near-white-on-pastel, which is what made chips like
  // "My Hobbies" unreadable). See TagChip.tsx's "tinted" variant.
  chipTintBg: "#C9D5F7",
  chipTintText: "#032068",
  chipTintBorder: "rgba(3,32,104,0.25)",
};

export const darkTheme: ColorTokens = {
  background: "#05081E",
  card: "#101A4A",
  text: "#EDEFFB",
  secondaryText: "#9BA1D4",
  border: "#26316E",
  primary: "#4C5FD1",
  secondary: "#1B2456",
  accent: "#FF8A8A",
  danger: "#FF8A8A",
  dangerBg: "#3A1620",
  dangerBorder: "#5C2430",
  success: "#34D399",
  tabBar: "#101A4A",
  tabBarActive: "#4C5FD1",
  tabBarInactive: "#5C6399",
  inputBackground: "#0B123A",
  // Unchanged from TagChip's previous hardcoded "tinted" variant values —
  // kept byte-identical so dark-theme chips render exactly as before.
  chipTintBg: "rgba(59,130,246,0.16)",
  chipTintText: "#F1F5F9",
  chipTintBorder: "rgba(96,165,250,0.4)",
};

/**
 * Fixed light palette for onboarding/auth/quiz — never toggles with dark
 * mode. Sourced from the Hobbily logo/app-icon palette (soft periwinkle,
 * deep navy, coral accent, near-black linework).
 *
 * `background` (#CACEF2) is intentionally unchanged from the original —
 * it's the exact color used for the Android adaptive icon and splash
 * screen backgrounds in app.json, so it's the one value in this theme that
 * must not drift or onboarding stops matching the icon/splash a user sees
 * seconds earlier. The "cards blend into the background" problem this
 * theme used to have wasn't really the background hue — it was `border`
 * and `secondary` sitting almost exactly on top of it (barely a few RGB
 * points apart) with no elevation to separate cards/inputs/buttons from
 * the page. Fixed here via a clearly deeper border, a visibly tinted
 * `secondary` layer, and shadow tokens (below) applied to cards/buttons.
 */
export const onboardingTheme: ColorTokens = {
  background: "#CACEF2",
  card: "#FFFFFF",
  // Near-black navy instead of pure #000 — ties primary text to the same
  // navy family as `primary`/the logo's linework, still effectively "near
  // black" for contrast.
  text: "#12163A",
  secondaryText: "#4A4E6D",
  // Was #B7BCEA — barely distinguishable from `background` (#CACEF2), so
  // any bordered element (inputs, option cards, the progress dots track)
  // visually dissolved into the page. Deepened within the same periwinkle
  // family so it reads clearly against both the page and white cards.
  border: "#9AA3E6",
  primary: "#032068",
  // Was #E4E6FB — nearly indistinguishable from white `card`. Deepened so
  // "secondary" surfaces (the quiz-discovery callout, toggle-mode track)
  // read as a distinct tinted layer between the page and pure-white cards.
  secondary: "#D6DBF8",
  accent: "#FC7273",
  danger: "#FC7273",
  dangerBg: "#FDE2E2",
  dangerBorder: "#FBB5B5",
  success: "#0E9F6E",
  tabBar: "#D6DBF8",
  tabBarActive: "#032068",
  tabBarInactive: "#7379B0",
  inputBackground: "#FFFFFF",
  // Medium blue for links/focus rings/secondary interactions (e.g. "Sign
  // in instead", the hidden-hobbies-quiz callout) — sits between `primary`
  // (deep navy, main actions) and `background` (periwinkle).
  link: "#3B5BC7",
  chipTintBg: "#CBD6F7",
  chipTintText: "#032068",
  chipTintBorder: "rgba(3,32,104,0.25)",
};

/** Elevation shadow for onboarding/quiz cards, inputs, and buttons — lifts
 * flat white/tinted surfaces off the periwinkle page background instead of
 * relying on hue contrast alone. Soft and subtle by design (low opacity,
 * generous radius) to stay calm rather than skeuomorphic. */
export const onboardingCardShadow = {
  shadowColor: "#1B1F4B",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.1,
  shadowRadius: 10,
  elevation: 3,
} as const;

/** Colors that mean the same thing regardless of active theme. */
export const brand = {
  white: "#FFFFFF",
  black: "#000000",
  /** Streak flame icon — used on Home, Profile, Time Manager, friends/leaderboard. */
  streakFlame: "#F59E0B",
  /** Opportunity cost tags on the Opportunities tab. */
  costFree: "#10B981",
  costSubsidised: "#2563EB",
  costPaid: "#8B5CF6",
  /** Standard modal/sheet backdrop. */
  overlay: "rgba(0,0,0,0.55)",
  /**
   * Stronger, theme-independent red for the most destructive/irreversible
   * action in the app (Delete Account) — deliberately more alarming than
   * the softer per-theme `danger` token used for ordinary errors/cancel
   * actions, and fixed so the warning reads the same in light or dark mode.
   */
  criticalDanger: "#EF4444",
};
