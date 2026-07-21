/**
 * AchievementUnlockToast — the "unlock experience" from Stage 4.F: a
 * non-blocking celebration banner mounted once at the app root (see
 * app/_layout.tsx), driven by ProgressContext's `justUnlocked` queue.
 * `justUnlocked` only ever gains entries when an achievement transitions
 * from locked to unlocked while the app is running (a fresh recordSession(),
 * or the one-time login reconciliation pass) — never replayed for
 * already-unlocked achievements on a later cold start, so this never
 * "repeatedly shows the same unlock after restart".
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { ColorTokens } from "../../context/ThemeContext";
import { useProgress } from "../../context/ProgressContext";

const VISIBLE_MS = 3200;

export default function AchievementUnlockToast({ colors }: { colors: ColorTokens }) {
  const { justUnlocked, clearJustUnlocked } = useProgress();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<{ id: string; title: string; description: string; icon: string } | null>(null);
  const [queue, setQueue] = useState<typeof justUnlocked>([]);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (justUnlocked.length === 0 || current) return;
    const [next, ...rest] = justUnlocked;
    setCurrent(next);
    // Consume the whole batch up front — further entries play out from
    // `queue` below rather than re-reading justUnlocked mid-animation.
    clearJustUnlocked();
    setQueue(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justUnlocked]);

  useEffect(() => {
    if (!current) return;
    progress.value = withSequence(
      withTiming(1, { duration: 220 }),
      withTiming(1, { duration: VISIBLE_MS }),
      withTiming(0, { duration: 220 })
    );
    const timer = setTimeout(() => {
      setCurrent(queue[0] ?? null);
      setQueue((q) => q.slice(1));
    }, 220 + VISIBLE_MS + 220);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -16 }],
  }));

  if (!current) return null;

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 8 }, animStyle]} pointerEvents="box-none">
      <Pressable
        style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.primary }]}
        onPress={() => {
          setCurrent(null);
          router.push({ pathname: "/(tabs)/profile", params: { tab: "badges" } } as any);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Achievement unlocked: ${current.title}. View badges.`}
      >
        <Ionicons name={(current.icon as any) ?? "trophy"} size={22} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          Achievement unlocked: {current.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 50 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 420,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  title: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
});
