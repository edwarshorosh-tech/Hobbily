/**
 * SwipeBackHandler — a single-purpose left-edge "swipe right to go back"
 * gesture for screens that swap themselves out via local component state
 * rather than a real navigator screen (e.g. Community's ChannelView — see
 * app/(tabs)/community.tsx's `activeChannel` state, which conditionally
 * renders the channel list OR the chat view instead of pushing a stack
 * screen). Because there's no actual Stack.Screen for a chat view, React
 * Navigation's own gestureEnabled/gestureDirection options have nothing to
 * attach to — this reuses the exact arm/commit/resist math already proven
 * in components/SwipeableTab.tsx (see utils/edgeSwipe.ts) and the same
 * EdgeSwipeIndicator, just wired to a single `onBack` callback instead of
 * adjacent-tab navigation, and with its own (slightly more permissive)
 * commit rule — SwipeableTab's shouldCommitSwipe commits on velocity alone
 * regardless of distance, which is intentionally not reused here: a
 * "swipe right to exit chat" should never fire from a very short, fast flick
 * with almost no travel.
 *
 * `disabled` must cover every other gesture/overlay the screen using this
 * owns that would conflict with an edge-swipe-back — an open bottom sheet or
 * modal, an active long-press action menu, a delete confirmation, or a
 * report flow. It's the caller's job to compute that (see ChannelView's own
 * `disabled` expression for what it covers and why).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent, View, useWindowDimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ColorTokens } from "../context/ThemeContext";
import { commitDistanceFor, nextArmedState, resistedTranslation, resolveEdgeZoneSide } from "../utils/edgeSwipe";
import EdgeSwipeIndicator from "./navigation/EdgeSwipeIndicator";

/** How close to the left screen edge a touch must start for the gesture to arm at all. */
const EDGE_ZONE = 24;
/** Adaptive commit distance bounds (px) — clamp(containerWidth * 0.22, MIN, MAX). */
const COMMIT_DISTANCE_MIN = 72;
const COMMIT_DISTANCE_MAX = 108;
/** A fast flick still commits even short of the full commit distance, but only once it has travelled at least this far — a very short, fast flick near the edge should never trigger it. */
const COMMIT_VELOCITY = 900;
const COMMIT_VELOCITY_MIN_DISTANCE = 40;
/** Below this fraction of pull progress, an already-armed indicator disarms — a hysteresis band so the armed/unarmed visual can't flicker right at the boundary. */
const DISARM_BELOW = 0.88;

/** worklet — same "distance OR fast-enough flick with real travel" rule described in the file header, kept local rather than reusing SwipeableTab's shouldCommitSwipe (see header comment on why it's not directly reused). */
function shouldCommitBack(translationX: number, velocityX: number, commitDistance: number): boolean {
  "worklet";
  return translationX > commitDistance || (velocityX >= COMMIT_VELOCITY && translationX >= COMMIT_VELOCITY_MIN_DISTANCE);
}

type Props = {
  onBack: () => void;
  colors: ColorTokens;
  backgroundColor: string;
  /** Reduce Motion — skips the slide/indicator animation in favor of an instant, near-zero-motion back. */
  reduceMotion?: boolean;
  /** Disarms the gesture entirely — for whenever the screen has its own open sheet/modal/menu/report-flow that a swipe would otherwise fight with. */
  disabled?: boolean;
  children: React.ReactNode;
};

export default function SwipeBackHandler({ onBack, colors, backgroundColor, reduceMotion = false, disabled = false, children }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = useSharedValue(windowWidth);
  const translateX = useSharedValue(0);
  const side = useSharedValue(0); // -1 once armed from the left edge, 0 otherwise
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const pull = useSharedValue(0);
  const committed = useSharedValue(0);
  const hapticFired = useSharedValue(0);
  const isNavigating = useSharedValue(0);
  const disabledSV = useSharedValue(disabled ? 1 : 0);
  const reduceMotionSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    disabledSV.value = disabled ? 1 : 0;
  }, [disabled, disabledSV]);
  useEffect(() => {
    reduceMotionSV.value = reduceMotion ? 1 : 0;
  }, [reduceMotion, reduceMotionSV]);
  useEffect(() => {
    containerWidth.value = windowWidth;
  }, [windowWidth, containerWidth]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerWidth.value = e.nativeEvent.layout.width;
    },
    [containerWidth]
  );

  // `onBack` is a fresh arrow function on every render of the caller (e.g.
  // community.tsx's `onBack={() => setActiveChannel(null)}`), and ChannelView
  // itself re-renders constantly (every message, every keystroke, every
  // avatar tap) — including synchronously, mid-tap, right as "Report user"
  // is pressed (it closes UserCardSheet, which is a state update in this
  // same parent). A ref lets the gesture below always call the *current*
  // onBack without needing onBack in its own dependency list.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  function goBack() {
    onBackRef.current();
  }

  function fireHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  // Built exactly once (useMemo, empty deps) rather than fresh on every
  // render. react-native-gesture-handler has to tear down and reattach the
  // native gesture handler whenever the JS-side gesture object's identity
  // changes — cheap in isolation, but ChannelView (the caller) can re-render
  // synchronously *during* the very tap that's still being recognized (e.g.
  // tapping "Report user" closes UserCardSheet, which is a state update in
  // this same parent, one React commit after the tap started) reattaching a
  // gesture mid-recognition is a documented way to wedge Gesture Handler's
  // native touch state, which reads as the whole screen going permanently
  // unresponsive. Every worklet below only ever reads/writes shared values
  // (stable across renders regardless of memoization) or calls goBack/
  // fireHaptic (which themselves only read the always-current onBackRef), so
  // there is nothing here that actually needs to be rebuilt per render.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Manual activation, same reasoning as SwipeableTab: decide from the
        // raw touch stream whether this gesture should ever take over,
        // rather than activeOffsetX/failOffsetY (which arm from anywhere on
        // screen and would fight the message list's vertical scroll for the
        // gesture arena).
        .manualActivation(true)
        .onTouchesDown((e, state) => {
          if (isNavigating.value === 1 || disabledSV.value === 1) {
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
          const resolvedSide = resolveEdgeZoneSide(touch.x, containerWidth.value, EDGE_ZONE, true, false);
          side.value = resolvedSide;
          if (resolvedSide !== -1) state.fail();
        })
        .onTouchesMove((e, state) => {
          if (side.value === 0) return;
          const touch = e.allTouches[0];
          if (!touch) return;
          const dx = touch.x - touchStartX.value;
          const dy = touch.y - touchStartY.value;
          // A clearly-vertical move means the user wants to scroll the
          // message list, not go back — release the gesture immediately.
          if (Math.abs(dy) > 15 && Math.abs(dy) > Math.abs(dx) * 1.2) {
            state.fail();
            return;
          }
          if (Math.abs(dx) > 10) state.activate();
        })
        .onStart(() => {
          hapticFired.value = 0;
        })
        .onUpdate((e) => {
          if (side.value !== -1 || e.translationX <= 0) return;
          const commitDistance = commitDistanceFor(containerWidth.value, COMMIT_DISTANCE_MIN, COMMIT_DISTANCE_MAX);
          translateX.value = resistedTranslation(e.translationX, containerWidth.value);
          pull.value = Math.min(1.3, e.translationX / commitDistance);
          committed.value = nextArmedState(pull.value, committed.value, DISARM_BELOW);
          if (committed.value === 1 && hapticFired.value === 0) {
            hapticFired.value = 1;
            runOnJS(fireHaptic)();
          } else if (committed.value === 0) {
            hapticFired.value = 0;
          }
        })
        // Navigation only ever runs from onEnd (finger already lifted) —
        // never mid-drag, however far past the threshold the finger has
        // travelled.
        .onEnd((e) => {
          if (side.value !== -1) {
            translateX.value = withTiming(0, { duration: 220 });
            return;
          }
          const commitDistance = commitDistanceFor(containerWidth.value, COMMIT_DISTANCE_MIN, COMMIT_DISTANCE_MAX);
          const commit = shouldCommitBack(e.translationX, e.velocityX, commitDistance);
          if (commit) {
            isNavigating.value = 1;
            const reduce = reduceMotionSV.value === 1;
            const slideTo = reduce ? Math.min(24, containerWidth.value) : containerWidth.value;
            translateX.value = withTiming(slideTo, { duration: reduce ? 100 : 200 }, (finished) => {
              "worklet";
              if (finished) {
                runOnJS(goBack)();
                translateX.value = 0;
              }
            });
          } else {
            translateX.value = withTiming(0, { duration: 220 });
          }
        })
        .onFinalize(() => {
          if (isNavigating.value === 1) return;
          pull.value = withTiming(0, { duration: 180 });
          committed.value = 0;
          side.value = 0;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor }} onLayout={handleLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, backgroundColor }, animStyle]}>{children}</Animated.View>
      </GestureDetector>
      <EdgeSwipeIndicator direction="left" progress={pull} armed={committed} colors={colors} />
    </View>
  );
}
