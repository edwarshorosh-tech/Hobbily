/**
 * TipBanner
 * A dismissible tip card. Once dismissed it never shows again (AsyncStorage).
 * Reset via Settings → "Reset dismissed tips" (bumps TipsResetContext version,
 * causing all mounted banners to re-read AsyncStorage and reappear).
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useState, useEffect, createContext, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

// ── Reset context ─────────────────────────────────────────────────────────────

type TipsResetCtx = { version: number; bump: () => void };
const TipsResetContext = createContext<TipsResetCtx>({ version: 0, bump: () => {} });

export function TipsResetProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  return (
    <TipsResetContext.Provider value={{ version, bump: () => setVersion((v) => v + 1) }}>
      {children}
    </TipsResetContext.Provider>
  );
}

export function useTipsReset() {
  return useContext(TipsResetContext);
}

// ── TipBanner component ───────────────────────────────────────────────────────

type Props = {
  storageKey: string;
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  colors: any;
};

export default function TipBanner({ storageKey, text, icon = "bulb-outline", colors }: Props) {
  const [visible, setVisible] = useState(false);
  const { version } = useTipsReset();

  // Re-runs whenever `version` is bumped (i.e. after a tips reset)
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      setVisible(val !== "dismissed");
    });
  }, [storageKey, version]);

  async function dismiss() {
    setVisible(false);
    await AsyncStorage.setItem(storageKey, "dismissed");
  }

  if (!visible) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 1 }} />
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={colors.secondaryText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});

/** Keys used across the app — exported so Settings can reset them all. */
export const TIP_KEYS = {
  homeGettingStarted: "@hobbily_tip_home_getting_started",
  communityChannels: "@hobbily_tip_community_channels",
  timeSession: "@hobbily_tip_time_session",
};
