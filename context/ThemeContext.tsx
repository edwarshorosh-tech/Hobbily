/**
 * ThemeContext
 * Light:  background #CACEF2 · primary #032068 · cards #DEE1F7 · text #000000
 * Dark:   background #05081E · primary #4C5FD1 · cards #101A4A · text #EDEFFB
 */
import { createContext, useContext, useState, useEffect } from "react";
import { Appearance } from "react-native";

const lightTheme = {
  background: "#CACEF2",
  card: "#DEE1F7",
  text: "#000000",
  secondaryText: "#3F4368",
  border: "#A9AEDD",
  primary: "#032068",
  secondary: "#B9BEEA",
  accent: "#FC7273",
  danger: "#FC7273",
  success: "#0E9F6E",
  tabBar: "#DEE1F7",
  tabBarActive: "#032068",
  tabBarInactive: "#7379B0",
  inputBackground: "#DEE1F7",
};

const darkTheme = {
  background: "#05081E",
  card: "#101A4A",
  text: "#EDEFFB",
  secondaryText: "#9BA1D4",
  border: "#26316E",
  primary: "#4C5FD1",
  secondary: "#1B2456",
  accent: "#FF8A8A",
  danger: "#FF8A8A",
  success: "#34D399",
  tabBar: "#101A4A",
  tabBarActive: "#4C5FD1",
  tabBarInactive: "#5C6399",
  inputBackground: "#0B123A",
};

export type ColorTokens = typeof lightTheme;

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
