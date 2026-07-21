/**
 * ThemeContext — the authenticated app's light/dark mode (Profile > Settings
 * > Appearance > Dark Mode). Palettes live in constants/colors.ts, the single
 * source of truth also used by the onboarding/auth flow's fixed light theme.
 *
 * Defaults to light mode regardless of the device's system color scheme —
 * this is a deliberate in-app toggle (see app.json's userInterfaceStyle,
 * pinned to "light" for the same reason), not a mirror of OS Dark Mode.
 * The user's choice is persisted so it survives app restarts.
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ColorTokens, lightTheme, darkTheme } from "../constants/colors";

export type { ColorTokens };

const THEME_STORAGE_KEY = "@hobbily_dark_mode";

type ThemeContextType = {
  isDark: boolean;
  colors: ColorTokens;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => { if (stored === "true") setIsDark(true); })
      .catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, String(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? darkTheme : lightTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
