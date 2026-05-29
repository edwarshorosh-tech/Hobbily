/**
 * SwipeableTab — horizontal swipe navigation between tabs.
 *
 * Uses react-native-gesture-handler (Pan) + react-native-reanimated.
 *
 * Fixes vs the old PanResponder implementation:
 *   - failOffsetY: if the user moves vertically first the gesture fails
 *     immediately, so vertical ScrollViews are never blocked (up/down bug gone)
 *   - activeOffsetX: gesture only activates after a clear horizontal move
 *   - No bounce: snap-back is withTiming (ease-out), not a spring
 */
import { View, Dimensions } from "react-native";
import { useCallback } from "react";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";

const TABS = [
  "/(tabs)",
  "/(tabs)/time-manager",
  "/(tabs)/community",
  "/(tabs)/opportunities",
  "/(tabs)/profile",
] as const;

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 60;

type Props = {
  /** Index of this tab in the TABS array (0 = Feed … 4 = Profile) */
  tabIndex: number;
  /** Background colour keeps the sliding view opaque during transition */
  backgroundColor: string;
  children: React.ReactNode;
};

export default function SwipeableTab({ tabIndex, backgroundColor, children }: Props) {
  const translateX = useSharedValue(0);
  const hasPrev = tabIndex > 0;
  const hasNext = tabIndex < TABS.length - 1;

  // Reset position every time this tab gains focus
  useFocusEffect(
    useCallback(() => {
      translateX.value = 0;
    }, [translateX])
  );

  function navigateTo(index: number) {
    router.navigate(TABS[index]);
  }

  const pan = Gesture.Pan()
    // Only activate after a clear horizontal move …
    .activeOffsetX([-20, 20])
    // … and immediately fail if the user moves vertically first.
    // This hands control back to child ScrollViews for up/down scrolling.
    .failOffsetY([-15, 15])
    // Run callbacks on the JS thread so we can read hasPrev/hasNext directly.
    .runOnJS(true)
    .onUpdate((e) => {
      if (e.translationX < 0 && hasNext) {
        translateX.value = e.translationX;
      } else if (e.translationX > 0 && hasPrev) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD && hasNext) {
        // Commit: slide off to the left then navigate
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, (finished) => {
          "worklet";
          if (finished) {
            runOnJS(navigateTo)(tabIndex + 1);
            translateX.value = 0;
          }
        });
      } else if (e.translationX > SWIPE_THRESHOLD && hasPrev) {
        // Commit: slide off to the right then navigate
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, (finished) => {
          "worklet";
          if (finished) {
            runOnJS(navigateTo)(tabIndex - 1);
            translateX.value = 0;
          }
        });
      } else {
        // Snap back — ease-out, no bounce
        translateX.value = withTiming(0, { duration: 250 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor, overflow: "hidden" }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, backgroundColor }, animStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
