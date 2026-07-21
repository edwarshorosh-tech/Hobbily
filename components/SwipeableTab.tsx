/**
 * SwipeableTab — reusable edge-swipe navigation between the five main tabs
 * (Home → Planner → Community → Explore → Profile, in TABS order below).
 *
 * The gesture only ARMS when a touch begins inside a thin zone at the very
 * left or right edge of the screen (EDGE_ZONE) — everywhere else on the
 * screen (vertical scrolling, horizontal FlatLists/carousels, buttons,
 * TagChip rows, etc.) is left completely alone. This uses react-native-
 * gesture-handler's manual activation API (state.fail()/state.activate()
 * from onTouchesDown/onTouchesMove) instead of the old activeOffsetX/
 * failOffsetY thresholds, which used to arm from anywhere on screen and
 * could fight nested horizontal scrollers for the gesture arena.
 *
 * Visual feedback is a small elastic capsule that grows from the edge as
 * the user drags and switches from a neutral to a filled/primary color once
 * the commit threshold is crossed (with a single haptic tick) — it is purely
 * additive; bottom-tab navigation remains fully functional on its own.
 *
 * Navigation reuses the same router.navigate() the bottom tab bar itself
 * would trigger, so there is no separate "active tab" state to fall out of
 * sync — Expo Router's own navigation state is the single source of truth.
 */
import { AccessibilityInfo, LayoutChangeEvent, View, useWindowDimensions } from "react-native";
import { useCallback, useEffect, useRef } from "react";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { ColorTokens } from "../context/ThemeContext";
import { resolveAdjacentTabIndex, resolveEdgeZoneSide, shouldCommitSwipe } from "../utils/edgeSwipe";

const TABS = [
  "/(tabs)",
  "/(tabs)/time-manager",
  "/(tabs)/community",
  "/(tabs)/opportunities",
  "/(tabs)/profile",
] as const;

/** How close to the screen edge a touch must start for the gesture to arm at all. */
const EDGE_ZONE = 24;
/** Drag distance (px) that commits a tab change. */
const COMMIT_DISTANCE = 70;
/** A fast-enough flick (px/s) commits even if released a little short of COMMIT_DISTANCE. */
const COMMIT_VELOCITY = 900;

const CAPSULE_WIDTH = 5;
const CAPSULE_MIN_HEIGHT = 32;
const CAPSULE_MAX_HEIGHT = 68;

type Props = {
  /** Index of this tab in the TABS array (0 = Home … 4 = Profile) */
  tabIndex: number;
  /** Background colour keeps the sliding view opaque during transition */
  backgroundColor: string;
  colors: ColorTokens;
  children: React.ReactNode;
};

export default function SwipeableTab({ tabIndex, backgroundColor, colors, children }: Props) {
  // The commit-swipe slide-off distance needs the *actual rendered* width of
  // this component, not a stale window snapshot — useWindowDimensions()
  // seeds a same-frame default; onLayout below corrects it to the real
  // container width as soon as it's known, and keeps it live across
  // rotation/split-screen/foldable resizes.
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = useSharedValue(windowWidth);

  const translateX = useSharedValue(0);
  // Subtle content fade + small rise whenever this tab gains focus — the
  // bottom tab bar itself is untouched (Tabs navigator has no
  // screen-transition animation of its own), this just softens the instant
  // content swap. Reduced-motion collapses both to an instant, no-animation set.
  const contentOpacity = useSharedValue(1);
  const focusTranslateY = useSharedValue(0);
  const reduceMotionRef = useRef(false);
  const hasPrev = tabIndex > 0;
  const hasNext = tabIndex < TABS.length - 1;

  // Edge-swipe gesture state.
  // side: -1 = armed from the left edge (going to the previous tab),
  //        1 = armed from the right edge (going to the next tab), 0 = idle.
  const side = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const pull = useSharedValue(0); // 0..~1.3, drag progress toward COMMIT_DISTANCE
  const committed = useSharedValue(0); // 0/1 — past the commit threshold
  const hapticFired = useSharedValue(0); // fires at most once per gesture
  const isNavigating = useSharedValue(0); // guards against overlapping/duplicate transitions

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        reduceMotionRef.current = v;
      })
      .catch(() => undefined);

    // Initial check above only captures the setting at mount — subscribe so a
    // user toggling Reduce Motion in OS settings while the app is already
    // running (e.g. backgrounded) is picked up without needing a remount.
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      reduceMotionRef.current = v;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    containerWidth.value = windowWidth;
  }, [windowWidth, containerWidth]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerWidth.value = e.nativeEvent.layout.width;
    },
    [containerWidth]
  );

  // Reset position + fade content in every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      translateX.value = 0;
      isNavigating.value = 0;
      side.value = 0;
      pull.value = 0;
      committed.value = 0;
      const reduceMotion = reduceMotionRef.current;
      contentOpacity.value = reduceMotion ? 1 : 0.85;
      focusTranslateY.value = reduceMotion ? 0 : 6;
      contentOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : 170 });
      focusTranslateY.value = withTiming(0, { duration: reduceMotion ? 0 : 170 });
    }, [translateX, contentOpacity, focusTranslateY, isNavigating, side, pull, committed])
  );

  function navigateTo(index: number) {
    router.navigate(TABS[index]);
  }

  function fireHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  const pan = Gesture.Pan()
    // Manual activation: we decide ourselves, from the raw touch stream,
    // whether this gesture should ever take over — rather than the built-in
    // activeOffsetX/failOffsetY thresholds, which arm from anywhere on the
    // screen and would fight nested horizontal FlatLists/carousels for the
    // gesture arena.
    //
    // Deliberately no .runOnJS(true) here: stateManager.activate()/.fail()
    // (called below from onTouchesDown/onTouchesMove) are implemented via
    // Reanimated's setGestureState, which only works from a UI-thread
    // worklet. Forcing these callbacks onto the JS thread via .runOnJS(true)
    // is exactly what produced "[Reanimated] You can not use setGestureState
    // in non-worklet function." — every plain-JS call below (fireHaptic,
    // navigateTo) is instead explicitly hopped back to the JS thread with
    // runOnJS() at its call site.
    .manualActivation(true)
    .onTouchesDown((e, state) => {
      if (isNavigating.value === 1) {
        state.fail();
        return;
      }
      const touch = e.allTouches[0];
      if (!touch) {
        state.fail();
        return;
      }
      touchStartX.value = touch.x;
      touchStartY.value = touch.y;
      const resolvedSide = resolveEdgeZoneSide(touch.x, containerWidth.value, EDGE_ZONE, hasPrev, hasNext);
      side.value = resolvedSide;
      if (resolvedSide === 0) state.fail();
    })
    .onTouchesMove((e, state) => {
      if (side.value === 0) return;
      const touch = e.allTouches[0];
      if (!touch) return;
      const dx = touch.x - touchStartX.value;
      const dy = touch.y - touchStartY.value;
      // A clearly-vertical move means the user wants to scroll, not swipe
      // tabs — release the gesture immediately so the underlying ScrollView
      // / FlatList gets it instead.
      if (Math.abs(dy) > 15 && Math.abs(dy) > Math.abs(dx)) {
        state.fail();
        return;
      }
      if (Math.abs(dx) > 10) {
        state.activate();
      }
    })
    .onStart(() => {
      hapticFired.value = 0;
    })
    .onUpdate((e) => {
      // This callback is a UI-thread worklet (no .runOnJS(true) on the
      // gesture) — fireHaptic() is a plain JS/native-module call, so it must
      // hop back to the JS thread via runOnJS() rather than being called directly.
      if (side.value === -1 && e.translationX > 0 && hasPrev) {
        translateX.value = e.translationX;
        pull.value = Math.min(1.3, e.translationX / COMMIT_DISTANCE);
        const isCommitted = e.translationX > COMMIT_DISTANCE;
        committed.value = isCommitted ? 1 : 0;
        if (isCommitted && hapticFired.value === 0) {
          hapticFired.value = 1;
          runOnJS(fireHaptic)();
        }
      } else if (side.value === 1 && e.translationX < 0 && hasNext) {
        translateX.value = e.translationX;
        pull.value = Math.min(1.3, -e.translationX / COMMIT_DISTANCE);
        const isCommitted = -e.translationX > COMMIT_DISTANCE;
        committed.value = isCommitted ? 1 : 0;
        if (isCommitted && hapticFired.value === 0) {
          hapticFired.value = 1;
          runOnJS(fireHaptic)();
        }
      }
    })
    .onEnd((e) => {
      const commitPrev =
        side.value === -1 && hasPrev && shouldCommitSwipe(e.translationX, e.velocityX, COMMIT_DISTANCE, COMMIT_VELOCITY);
      const commitNext =
        side.value === 1 && hasNext && shouldCommitSwipe(-e.translationX, -e.velocityX, COMMIT_DISTANCE, COMMIT_VELOCITY);
      const targetIndex = commitPrev
        ? resolveAdjacentTabIndex(tabIndex, -1, TABS.length)
        : commitNext
          ? resolveAdjacentTabIndex(tabIndex, 1, TABS.length)
          : null;

      if (targetIndex !== null) {
        isNavigating.value = 1;
        const slideTo = commitPrev ? containerWidth.value : -containerWidth.value;
        translateX.value = withTiming(slideTo, { duration: 200 }, (finished) => {
          "worklet";
          if (finished) {
            runOnJS(navigateTo)(targetIndex);
            translateX.value = 0;
          }
        });
      } else {
        // Below threshold (or the boundary tab) — snap back, no navigation.
        translateX.value = withTiming(0, { duration: 220 });
      }
    })
    .onFinalize(() => {
      // Safety net: always fades the indicator back out, even if the OS
      // cancels the gesture without a normal onEnd (e.g. an interrupting
      // system alert). Idempotent with the onEnd branch above.
      pull.value = withTiming(0, { duration: 180 });
      committed.value = 0;
      side.value = 0;
    });

  const animStyle = useAnimatedStyle(() => {
    // A subtle "receding" depth cue while a swipe is in progress or
    // committing — the screen scales down and fades a touch as it's dragged
    // toward the edge, rather than sliding as a flat, weightless plane.
    // Purely a function of drag distance, so it costs nothing beyond what
    // translateX already tracks and never drives a React re-render.
    const width = containerWidth.value;
    const dragProgress = width > 0 ? Math.min(1, Math.abs(translateX.value) / width) : 0;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: focusTranslateY.value },
        { scale: 1 - dragProgress * 0.04 },
      ],
      opacity: contentOpacity.value * (1 - dragProgress * 0.15),
    };
  });

  const leftCapsuleStyle = useAnimatedStyle(() => {
    const active = side.value === -1 ? pull.value : 0;
    return {
      opacity: interpolate(active, [0, 0.15, 1.3], [0, 1, 1], Extrapolation.CLAMP),
      height: CAPSULE_MIN_HEIGHT + Math.min(active, 1) * (CAPSULE_MAX_HEIGHT - CAPSULE_MIN_HEIGHT),
      backgroundColor: committed.value === 1 && side.value === -1 ? colors.primary : colors.secondaryText,
      transform: [{ scale: committed.value === 1 && side.value === -1 ? 1.15 : 1 }],
    };
  });

  const rightCapsuleStyle = useAnimatedStyle(() => {
    const active = side.value === 1 ? pull.value : 0;
    return {
      opacity: interpolate(active, [0, 0.15, 1.3], [0, 1, 1], Extrapolation.CLAMP),
      height: CAPSULE_MIN_HEIGHT + Math.min(active, 1) * (CAPSULE_MAX_HEIGHT - CAPSULE_MIN_HEIGHT),
      backgroundColor: committed.value === 1 && side.value === 1 ? colors.primary : colors.secondaryText,
      transform: [{ scale: committed.value === 1 && side.value === 1 ? 1.15 : 1 }],
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor, overflow: "hidden" }} onLayout={handleLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, backgroundColor }, animStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>

      {/* Edge-swipe indicators — purely decorative, never intercept taps. */}
      {hasPrev && (
        <Animated.View pointerEvents="none" style={[styles.capsule, styles.capsuleLeft, leftCapsuleStyle]} />
      )}
      {hasNext && (
        <Animated.View pointerEvents="none" style={[styles.capsule, styles.capsuleRight, rightCapsuleStyle]} />
      )}
    </View>
  );
}

const styles = {
  capsule: {
    position: "absolute" as const,
    top: "50%" as const,
    width: CAPSULE_WIDTH,
    marginTop: -CAPSULE_MAX_HEIGHT / 2,
    borderRadius: CAPSULE_WIDTH / 2,
  },
  capsuleLeft: { left: 4 },
  capsuleRight: { right: 4 },
};
