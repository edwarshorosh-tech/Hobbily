/**
 * ThemeContext — the authenticated app's light/dark mode (Profile > Settings
 * > Appearance > Dark Mode). Palettes live in constants/colors.ts, the single
 * source of truth also used by the onboarding/auth flow's fixed light theme.
 */
import { createContext, useContext, useState, useEffect } from "react";
import { Appearance } from "react-native";
import { ColorTokens, lightTheme, darkTheme } from "../constants/colors";

export type { ColorTokens };

type ThemeContextType = {
  isDark: boolean;
  colors: ColorTokens;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemPrefersDark = Appearance.getColorScheme() === "dark";
  const [isDark, setIsDark] = useState(systemPrefersDark);

  useEffect(() => setIsDark(systemPrefersDark), [systemPrefersDark]);

  return (
    <ThemeContext.Provider
      value={{ isDark, colors: isDark ? darkTheme : lightTheme, toggleTheme: () => setIsDark((p) => !p) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
