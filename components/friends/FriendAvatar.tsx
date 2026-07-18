/**
 * FriendAvatar — shared circular avatar with initials fallback.
 * Used by the Friends card, the search/requests modal, the Home leaderboard,
 * the Profile identity card, and Settings' photo row, so every avatar in the
 * app renders identically. Falls back to an initials circle whenever
 * avatarUrl is null (no photo uploaded, or it was removed).
 */
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { ColorTokens } from "../../context/ThemeContext";

type Props = {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  colors: ColorTokens;
  style?: StyleProp<ViewStyle>;
  /** Adds a subtle ring around the avatar (used to mark the current user). */
  highlighted?: boolean;
};

function initialsFor(username: string): string {
  const trimmed = (username || "?").trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function FriendAvatar({ username, avatarUrl, size = 44, colors, style, highlighted }: Props) {
  const initials = initialsFor(username);
  const fontSize = Math.max(11, Math.round(size * 0.4));

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
        },
        highlighted && {
          borderWidth: 2,
          borderColor: colors.accent,
        },
        style,
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    color: "#fff",
    fontWeight: "800",
  },
});
