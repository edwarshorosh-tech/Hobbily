/**
 * DisclaimerOverlay — the global, page-aware disclaimer banner. Mounted once
 * at the app root (see app/_layout.tsx), rendered above the Stack/tab bar/
 * every screen. Never auto-dismisses (no timers anywhere in this file) —
 * the only way a disclaimer goes away is the user tapping Close, which
 * persists via ProfileContext.dismissDisclaimer (see its doc comment for why
 * that's a dotted-path merge, not a full-map overwrite).
 *
 * One disclaimer visible at a time, highest priority first for the current
 * route (constants/disclaimers.ts's disclaimersForRoute); dismissing it
 * re-renders with that route's next undismissed disclaimer already excluded
 * by the same filter, so the queue advances on its own without extra
 * bookkeeping. Navigating to a different page recomputes for that page's
 * own registry entries; navigating back re-shows anything on this page
 * still not dismissed, since dismissal state (not "have I shown this
 * already this session") is what the filter is keyed on.
 */
import { useMemo } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useProfile } from "../context/ProfileContext";
import { useAuth } from "../context/AuthContext";
import { disclaimerKey, disclaimersForRoute } from "../constants/disclaimers";

export default function DisclaimerOverlay() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { profile, dismissDisclaimer } = useProfile();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const current = useMemo(() => {
    if (!user) return null;
    const candidates = disclaimersForRoute(pathname);
    return candidates.find((d) => !profile.dismissedDisclaimers[disclaimerKey(d)]) ?? null;
  }, [user, pathname, profile.dismissedDisclaimers]);

  if (!current) return null;
  const key = disclaimerKey(current);

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="alert"
      >
        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name={current.icon as any} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
          <Text style={[styles.description, { color: colors.secondaryText }]}>{current.description}</Text>
          {current.actionLabel && current.actionRoute && (
            <TouchableOpacity
              onPress={() => router.push(current.actionRoute as any)}
              accessibilityRole="button"
              accessibilityLabel={current.actionLabel}
              style={{ marginTop: 6 }}
            >
              <Text style={[styles.actionText, { color: colors.primary }]}>{current.actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => dismissDisclaimer(key)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${current.title}`}
        >
          <Ionicons name="close" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 100, elevation: 100 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700" },
  description: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionText: { fontSize: 12, fontWeight: "700" },
});
