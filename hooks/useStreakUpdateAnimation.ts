/**
 * useStreakUpdateAnimation — drives the small celebratory pulse on a streak
 * badge (components/home/StreakButton.tsx, FriendsLeaderboard's own "You"
 * row) whenever the real streak value changes, and only then. ProgressContext
 * recomputes currentStreak fresh on every render (see
 * context/ProgressContext.tsx's computeCurrentStreak) rather than storing it,
 * so "changed" has to be judged against the previous render's value, not
 * against some persisted "last seen" field.
 *
 * Deliberately never animates:
 *  - the very first value a caller sees after mount, or after `isLoaded`
 *    drops back to false and returns to true (a full reload — e.g.
 *    logout/login, or a network retry) — that first post-load value is
 *    always treated as the new baseline, never a change. This is what keeps
 *    initial load and a "restored" streak calm instead of reading as a
 *    fresh achievement.
 *  - a re-render where the value hasn't actually moved (background
 *    refetch returning the same number, a page focus, an unrelated
 *    parent re-render).
 *
 * Both StreakButton (Profile header) and FriendsLeaderboard's own streak row
 * (Home) can be mounted at the same time (Expo Router's Tabs keeps inactive
 * tabs alive) and both read the same live ProgressContext value — so a
 * single real streak change would otherwise fire two independent "increase"
 * haptics in the same instant. lastHapticStreak is a module-level (not
 * per-instance) guard so whichever instance's effect runs first claims the
 * haptic for that value; every other mounted instance still gets its own
 * visual pulse (harmless, and expected — every visible badge should
 * animate), just not a second haptic tick.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as Haptics from "expo-haptics";
import { useSharedValue, useAnimatedStyle, withSequence, withTiming } from "react-native-reanimated";

export type StreakChangeKind = "none" | "increased" | "reset";

let lastHapticStreak: number | null = null;

export function useStreakUpdateAnimation(value: number, isLoaded: boolean) {
  const previousRef = useRef<number | null>(null);
  const wasLoadedRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [change, setChange] = useState<StreakChangeKind>("none");

  // Normal-motion path: scale bump + icon rise + a soft glow pulse.
  const scale = useSharedValue(1);
  const iconTranslateY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  // Reduce Motion path: a plain opacity crossfade — kept as its own shared
  // value rather than reusing `scale`/`glowOpacity` so the two modes never
  // fight over the same driver.
  const fadeOpacity = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      // A reload is in flight (or hasn't started yet) — drop the baseline so
      // whatever value lands next is treated as fresh, not a change.
      wasLoadedRef.current = false;
      return;
    }
    if (!wasLoadedRef.current) {
      previousRef.current = value;
      wasLoadedRef.current = true;
      return;
    }
    const previous = previousRef.current;
    previousRef.current = value;
    if (previous === null || value === previous) return;

    const kind: StreakChangeKind = value > previous ? "increased" : "reset";
    setChange(kind);

    if (reduceMotion) {
      // Same short, quiet crossfade either way — Reduce Motion collapses
      // "celebration" and "calm update" into the same minimal motion.
      fadeOpacity.value = withSequence(withTiming(0.45, { duration: 90 }), withTiming(1, { duration: 160 }));
    } else if (kind === "increased") {
      scale.value = withSequence(withTiming(1.12, { duration: 150 }), withTiming(1, { duration: 200 }));
      iconTranslateY.value = withSequence(withTiming(-4, { duration: 150 }), withTiming(0, { duration: 200 }));
      glowOpacity.value = withSequence(withTiming(0.35, { duration: 140 }), withTiming(0, { duration: 260 }));
    } else {
      // Reset — a calm crossfade, never a celebration: no icon rise, no glow.
      scale.value = withSequence(withTiming(0.94, { duration: 120 }), withTiming(1, { duration: 180 }));
    }

    if (kind === "increased" && lastHapticStreak !== value) {
      lastHapticStreak = value;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isLoaded, reduceMotion]);

  const scaleStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
    transform: [{ scale: scale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: iconTranslateY.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return { scaleStyle, iconStyle, glowStyle, change, reduceMotion };
}
