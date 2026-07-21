/**
 * ThemeContext — the authenticated app's light/dark mode (Profile > Settings
 * > Appearance > Dark Mode). Palettes live in constants/colors.ts, the single
 * source of truth also used by the onboarding/auth flow's fixed light theme.
 *
 * Source of truth, in priority order:
 *   1. An explicit preference persisted locally on this device (AsyncStorage)
 *      — always wins once found, for the lifetime of the app.
 *   2. The signed-in user's saved profile preference (users/{uid}.themePreference),
 *      used only when no local preference exists yet on this device (e.g. a
 *      fresh install, or logging into an existing account on a new device).
 *   3. Light — the fallback for a genuinely new preference (no local value,
 *      no signed-in user, or a signed-in user who has never explicitly chosen).
 *
 * Deliberately NOT derived from Appearance.getColorScheme() (the OS setting)
 * and NOT reset by authentication, onboarding, or navigation — those were
 * exactly the previous behaviors that made the app appear to "switch to
 * dark after registration" on any device with system dark mode enabled.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { ColorTokens, lightTheme, darkTheme } from "../constants/colors";
import { ThemePreference } from "../types/Profile";
import { useAuth } from "./AuthContext";
import { useProfile } from "./ProfileContext";

export type { ColorTokens, ThemePreference };

const THEME_STORAGE_KEY = "@hobbily_theme_preference";

type ThemeContextType = {
  isDark: boolean;
  colors: ColorTokens;
  /** True once the local device preference (and, for a signed-in user, their saved profile preference) has been resolved — gate initial rendering on this to avoid a light/dark flash rather than defaulting to the OS scheme. */
  isReady: boolean;
  toggleTheme: () => void;
  setThemePreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, isLoaded: profileLoaded, updateThemePreference } = useProfile();

  const [preference, setPreference] = useState<ThemePreference>("light");
  const [localChecked, setLocalChecked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // Refs, not state — read synchronously inside the effect below without
  // becoming a dependency that could re-trigger it.
  const hasLocalValue = useRef(false);

  // Step 1: read the locally persisted preference once, on mount. Runs
  // exactly once regardless of auth state — this is a device preference,
  // not a per-account one, and must never wait on network/auth to appear.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw === "light" || raw === "dark") {
          hasLocalValue.current = true;
          setPreference(raw);
        }
      })
      .finally(() => {
        if (!cancelled) setLocalChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: only when no local value exists, fall back to the signed-in
  // user's saved profile preference. Re-evaluates on every sign-in (a fresh
  // `profileLoaded` cycle) so "log in on a new device" restores the right
  // theme, but a local value (once found) short-circuits this permanently —
  // and signing out never touches `preference` at all.
  useEffect(() => {
    if (!localChecked) return;
    if (hasLocalValue.current) {
      setIsReady(true);
      return;
    }
    if (!user) {
      setIsReady(true);
      return;
    }
    if (!profileLoaded) return; // wait for this sign-in's profile to finish loading
    if (profile.themePreference === "light" || profile.themePreference === "dark") {
      setPreference(profile.themePreference);
    }
    setIsReady(true);
  }, [localChecked, user, profileLoaded, profile.themePreference]);

  const persist = useCallback(
    (pref: ThemePreference) => {
      hasLocalValue.current = true;
      setPreference(pref);
      // Fire-and-forget on both sides — the UI already reflects `pref` via
      // the state update above, so neither write blocks it. AsyncStorage is
      // best-effort local persistence; updateThemePreference queues its own
      // Firestore write and is safely offline-tolerant (Firestore's SDK
      // persists pending writes and resyncs once reachable).
      AsyncStorage.setItem(THEME_STORAGE_KEY, pref).catch(() => undefined);
      updateThemePreference(pref);
    },
    [updateThemePreference]
  );

  const setThemePreference = useCallback((pref: ThemePreference) => persist(pref), [persist]);
  const toggleTheme = useCallback(() => persist(preference === "dark" ? "light" : "dark"), [persist, preference]);

  const isDark = preference === "dark";

  // Android renders edge-to-edge (app.json: android.edgeToEdgeEnabled), so
  // any gap between this app's own views and the true screen edge — a
  // layout rounding difference, an in-flight transition — reveals the
  // native window's background instead of nothing. That background defaults
  // to black and isn't part of the React tree, so no amount of styling a
  // screen's own View fixes it; it has to be set directly via expo-system-ui.
  // Keeping it in sync with the resolved theme here (rather than a static
  // app.json color) is what actually eliminates the black flash/strip this
  // could otherwise produce, in both light and dark mode.
  useEffect(() => {
    if (Platform.OS === "web") return;
    SystemUI.setBackgroundColorAsync(isDark ? darkTheme.background : lightTheme.background).catch(() => undefined);
  }, [isDark]);

  const value = useMemo(
    () => ({ isDark, colors: isDark ? darkTheme : lightTheme, isReady, toggleTheme, setThemePreference }),
    [isDark, isReady, toggleTheme, setThemePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
