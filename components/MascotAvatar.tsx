/**
 * MascotAvatar — Bubble, Hobbily's purple robot AI mascot. One shared visual
 * identity used everywhere the AI Assistant is represented, so it can never
 * visually drift apart between them: the AI Assistant card on Home
 * (app/(tabs)/index.tsx) and the post-signup OnboardingTour's speech bubble
 * (components/OnboardingTour.tsx).
 *
 * Purple (brand.mascotPurple/-Dark) is fixed, not a theme color — Bubble
 * looks the same in light or dark mode. Fully proportional to `size` so the
 * same component works at the tour's 40px and Home's smaller header size.
 */
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brand } from "../constants/colors";

/** Bubble's display name — the one place it's defined, so every screen referencing the mascot by name imports it rather than re-typing the string. */
export const MASCOT_NAME = "Bubble";

type Props = {
  /** Overall square size (width = height) in px. Antenna and icon scale proportionally. */
  size?: number;
};

export default function MascotAvatar({ size = 40 }: Props) {
  const iconSize = Math.round(size * 0.475);
  const stemWidth = Math.max(2, Math.round(size * 0.1));
  const stemHeight = Math.round(size * 0.2);
  const ballSize = Math.round(size * 0.2);

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: Math.round(size * 0.325) }]}>
      <View
        style={[
          styles.antennaStem,
          {
            width: stemWidth,
            height: stemHeight,
            top: -stemHeight * 0.75,
            left: size / 2 - stemWidth / 2,
          },
        ]}
      />
      <View
        style={[
          styles.antennaBall,
          {
            width: ballSize,
            height: ballSize,
            borderRadius: ballSize / 2,
            top: -stemHeight * 1.5,
            left: size / 2 - ballSize / 2,
          },
        ]}
      />
      <Ionicons name="hardware-chip-outline" size={iconSize} color={brand.white} />
    </View>
  );
}

/** The pill "attached" to the mascot's name wherever it's shown alongside the avatar — same purple tint everywhere. */
export function MascotNameBadge({ label = MASCOT_NAME }: { label?: string }) {
  return (
    <View style={styles.nameBadge}>
      <Text style={styles.nameBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: brand.mascotPurple,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.mascotPurpleDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  antennaStem: { position: "absolute", borderRadius: 2, backgroundColor: brand.mascotPurpleDark },
  antennaBall: { position: "absolute", backgroundColor: brand.white },
  nameBadge: {
    alignSelf: "flex-start",
    backgroundColor: brand.mascotPurpleTint,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  nameBadgeText: { fontSize: 13, fontWeight: "800", color: brand.mascotPurpleDark },
});
