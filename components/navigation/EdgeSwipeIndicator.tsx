/**
 * EdgeSwipeIndicator — the capsule-shaped, progressively-filling arrow shown
 * near the screen edge during SwipeableTab's edge-swipe gesture. Purely
 * presentational and driven entirely by shared values passed in from the
 * gesture (SwipeableTab.tsx) — every frame of motion here runs on the UI
 * thread via useAnimatedStyle, never a React re-render.
 *
 * Visual stages (see SwipeableTab's pull/committed shared values):
 *  - progress ~0: barely visible, thin outline, unfilled.
 *  - progress 0-1: capsule grows, accent fill rises from the bottom, the
 *    arrow glyph nudges slightly toward the swipe direction.
 *  - armed (progress has crossed the commit threshold, with hysteresis so it
 *    can't flicker right at the boundary — see SwipeableTab): fully filled,
 *    high-contrast icon, a subtle scale pop.
 */
import { StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, interpolateColor, SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";

type Props = {
  direction: "left" | "right";
  /** 0 at rest, ramps to ~1 at the commit threshold, can exceed 1 slightly on an overshoot drag. */
  progress: SharedValue<number>;
  /** 0/1 — whether the gesture is currently past the commit threshold (hysteresis-guarded by the caller). */
  armed: SharedValue<number>;
  colors: ColorTokens;
};

const CAPSULE_WIDTH = 34;
const CAPSULE_MIN_HEIGHT = 38;
const CAPSULE_MAX_HEIGHT = 68;
const ARROW_TRAVEL = 3;

export default function EdgeSwipeIndicator({ direction, progress, armed, colors }: Props) {
  const capsuleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const clamped = Math.min(p, 1);
    return {
      opacity: interpolate(p, [0, 0.15, 1.3], [0, 1, 1], Extrapolation.CLAMP),
      height: CAPSULE_MIN_HEIGHT + clamped * (CAPSULE_MAX_HEIGHT - CAPSULE_MIN_HEIGHT),
      transform: [{ scale: armed.value === 1 ? 1.06 : 1 }],
      borderColor: interpolateColor(armed.value, [0, 1], [colors.border, colors.primary]),
    };
  });

  const fillStyle = useAnimatedStyle(() => ({
    height: `${Math.min(progress.value, 1) * 100}%`,
    backgroundColor: interpolateColor(armed.value, [0, 1], [`${colors.primary}55`, colors.primary]),
  }));

  const iconStyle = useAnimatedStyle(() => {
    const p = Math.min(progress.value, 1);
    const travel = direction === "left" ? -ARROW_TRAVEL * p : ARROW_TRAVEL * p;
    return {
      transform: [{ translateX: travel }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.capsule, direction === "left" ? styles.left : styles.right, { backgroundColor: colors.card }, capsuleStyle]}
    >
      {/* Fill layer — anchored to the bottom, grows upward with drag progress; this is the "liquid filling" cue, not the outline capsule itself. */}
      <Animated.View pointerEvents="none" style={[styles.fill, fillStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons name={direction === "left" ? "chevron-back" : "chevron-forward"} size={17} color={colors.text} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    position: "absolute",
    top: "50%",
    width: CAPSULE_WIDTH,
    marginTop: -CAPSULE_MAX_HEIGHT / 2,
    borderRadius: CAPSULE_WIDTH / 2,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  left: { left: 4 },
  right: { right: 4 },
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
