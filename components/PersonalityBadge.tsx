/**
 * PersonalityBadge — the one reusable "hobby archetype" chip, shown wherever
 * a personality result is both present and permitted to be shown (own
 * Profile, UserCardSheet, and any future profile-preview surface). Callers
 * decide the permission check (personalityTypeName != null already implies
 * it, since profileService.ts never mirrors a name into publicProfiles
 * unless showPersonalityType is on) — this component just renders it
 * consistently, compact enough not to break a tight row.
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../context/ThemeContext";

type Props = {
  personalityTypeName: string;
  colors: ColorTokens;
  /** Smaller variant for tight rows (e.g. a compact list item) — full text still shown, never truncated to an icon-only chip. */
  compact?: boolean;
};

export default function PersonalityBadge({ personalityTypeName, colors, compact }: Props) {
  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` },
      ]}
    >
      <Ionicons name="sparkles" size={compact ? 11 : 13} color={colors.primary} />
      <Text style={[styles.text, compact && styles.textCompact, { color: colors.primary }]} numberOfLines={1}>
        {personalityTypeName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeCompact: { paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontSize: 12, fontWeight: "700" },
  textCompact: { fontSize: 11 },
});
