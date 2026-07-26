/**
 * OnboardingTour — spotlight/coachmark walkthrough shown exactly once,
 * immediately after a brand-new account finishes the sign-up wizard
 * (app/onboarding.tsx) and lands on the tabs. Mounted in
 * app/(tabs)/_layout.tsx, gated by services/onboardingTourBridge.ts's
 * one-shot "just registered" flag — see that file's doc comment for why a
 * persisted Firestore field alone can't tell "brand-new account" apart from
 * "existing account signing in for the first time on this device."
 *
 * Steps 1-2 (AI Assistant, Add Friends) live on Home; step 3 (Planner) lives
 * on its own tab — those steps carry a `route` and this component navigates
 * there itself before measuring. The last two steps target the bottom tab
 * bar directly, which is always mounted and visible regardless of which tab
 * is focused, so no navigation is needed for those.
 *
 * All motion (the spotlight cutout's position/size and the tooltip's fade)
 * is driven entirely by Reanimated shared values updated with
 * withSpring/withTiming — never by re-rendering with new inline numbers —
 * so every frame of a transition runs on the UI thread, unaffected by JS
 * thread/bridge load (Metro-over-tunnel included). The four dim panels and
 * the highlight ring all read the *same* four shared values (top/bottom/
 * left/right), which is what guarantees they can never drift out of sync
 * with each other mid-animation.
 *
 * Transition choreography: moving to a new step immediately fades the
 * tooltip out; the spotlight box only starts gliding (withSpring) toward the
 * new target once it's actually been measured (navigation/lazy-mount time is
 * however long it takes), and the tooltip fades back in exactly when that
 * glide's spring settles — never before, so it's never visible pointing at a
 * stale or mid-flight position.
 *
 * Skip (pinned top-right) and Get Started/"Got it" (last step) both end the
 * tour the same way: persist completion via onFinish and land the user back
 * on Home, regardless of which tab the tour was on when it ended.
 *
 * The tooltip is styled as a speech bubble "spoken" by Bubble, a small mascot
 * avatar embedded in the bubble's own header — so it moves as one glued-
 * together unit with the bubble (see belowStyle/aboveStyle below) rather
 * than needing its own separate position to keep in sync. Bubble gets a
 * playful little bounce (mascotScale, a bouncier spring than the box's) each
 * time it arrives at a new step, timed off the same spring-completion
 * callback that fades the bubble back in.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useTourTargets, TourTargetId, TourTargetRect } from "../context/TourTargetsContext";
import { brand } from "../constants/colors";
import MascotAvatar, { MascotNameBadge } from "./MascotAvatar";

const HOME_ROUTE = "/(tabs)/" as any;

type Step = {
  targetId: TourTargetId;
  /** Href to navigate to before measuring — omitted for steps whose target (the tab bar) is visible from any current screen. */
  route?: any;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    targetId: "aiAssistant",
    route: HOME_ROUTE,
    title: "AI Assistant",
    body: "Hi, I'm Bubble! I'm your AI assistant — chat with me here to discover new hobbies, talk through your plans, or just say \"add it\" and I'll schedule an activity for you.",
  },
  {
    targetId: "addFriends",
    route: HOME_ROUTE,
    title: "Adding Friends",
    body: "Tap here to add friends! You'll see each other's streaks and can cheer each other on to stay motivated.",
  },
  {
    targetId: "plannerAddActivity",
    route: "/(tabs)/time-manager" as any,
    title: "Planner & Adding Activities",
    body: "This is your planner. Tap Add Activity here to schedule a hobby session or task on your calendar.",
  },
  {
    targetId: "communityTab",
    title: "Community",
    body: "Over here is Community — a group chat connecting people with shared interests to talk and share experiences.",
  },
  {
    targetId: "exploreTab",
    title: "Explore",
    body: "And last but not least, Explore is your gateway to finding local places, venues, and open spots — both free and paid — to practice and develop your hobbies. Have fun!",
  },
];

/** Extra breathing room around the real element's measured bounds for the spotlight cutout/ring. */
const PAD = 8;
/** Gap between the spotlight cutout and the speech bubble's near edge. */
const BUBBLE_GAP = 14;
/** Absolute floor for the bubble's available-space budget — never let a device/inset combo squeeze it to nothing. */
const MIN_BUBBLE_ROOM = 150;
/** Reserved for the mascot header + Next/Got it button + padding — subtracted from the bubble's budget to get how much is actually left for the title+body text. */
const BUBBLE_CHROME_HEIGHT = 150;
/** How long to let a just-triggered navigation (lazy tab mount, or an in-page auto-scroll) settle before the first measurement attempt. */
const NAVIGATION_SETTLE_MS = 450;
const MEASURE_RETRY_MS = 120;
const MAX_MEASURE_ATTEMPTS = 20;
/** Subtle, non-bouncy glide for the spotlight box — high damping relative to stiffness so it settles into the new target without overshoot. */
const BOX_SPRING = { damping: 22, stiffness: 180, mass: 0.8 };
/** Playful bounce for Bubble's arrival "pop" — lower damping than BOX_SPRING so it visibly overshoots before settling. */
const MASCOT_SPRING = { damping: 9, stiffness: 200, mass: 0.6 };
const MASCOT_SHRINK_SCALE = 0.7;
const TOOLTIP_FADE_OUT_MS = 150;
const TOOLTIP_FADE_IN_MS = 220;
const COLLAPSE_MS = 260;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Phase = "measuring" | "found" | "notfound";

type Props = {
  visible: boolean;
  onFinish: () => void;
};

export default function OnboardingTour({ visible, onFinish }: Props) {
  const { colors } = useTheme();
  const { measureTarget } = useTourTargets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("measuring");
  /** Only read at render time (to decide tooltip placement) — never drives an animation directly, so it doesn't need to be a shared value. */
  const lastRectRef = useRef<TourTargetRect | null>(null);

  // The one shared "truth" for the spotlight box — every dim panel and the
  // ring below reads these same four values, so they can never disagree
  // about where the cutout is mid-animation.
  const topV = useSharedValue(0);
  const bottomV = useSharedValue(0);
  const leftV = useSharedValue(0);
  const rightV = useSharedValue(0);
  const tooltipOpacity = useSharedValue(0);
  const mascotScale = useSharedValue(MASCOT_SHRINK_SCALE);

  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (!visible) {
      setStepIndex(0);
      setPhase("measuring");
      lastRectRef.current = null;
      topV.value = 0;
      bottomV.value = 0;
      leftV.value = 0;
      rightV.value = 0;
      tooltipOpacity.value = 0;
      mascotScale.value = MASCOT_SHRINK_SCALE;
      return;
    }

    let cancelled = false;
    setPhase("measuring");
    tooltipOpacity.value = withTiming(0, { duration: TOOLTIP_FADE_OUT_MS });
    mascotScale.value = withTiming(MASCOT_SHRINK_SCALE, { duration: TOOLTIP_FADE_OUT_MS });
    const step = STEPS[stepIndex];

    async function locateTarget() {
      if (step.route) {
        router.navigate(step.route);
        await wait(NAVIGATION_SETTLE_MS);
      }
      for (let attempt = 0; attempt < MAX_MEASURE_ATTEMPTS; attempt++) {
        if (cancelled) return;
        const rect = await measureTarget(step.targetId);
        if (rect) {
          if (cancelled) return;
          lastRectRef.current = rect;
          const clampedTop = Math.max(0, rect.y - PAD);
          const clampedBottom = Math.min(screenHeight, rect.y + rect.height + PAD);
          const clampedLeft = Math.max(0, rect.x - PAD);
          const clampedRight = Math.min(screenWidth, rect.x + rect.width + PAD);
          // Only one of the four springs needs the completion callback —
          // they're all started together and use the same config, so they
          // settle together; firing the tooltip fade-in off all four would
          // just call it redundantly.
          topV.value = withSpring(clampedTop, BOX_SPRING, (finished) => {
            if (finished) {
              tooltipOpacity.value = withTiming(1, { duration: TOOLTIP_FADE_IN_MS });
              mascotScale.value = withSpring(1, MASCOT_SPRING);
            }
          });
          bottomV.value = withSpring(clampedBottom, BOX_SPRING);
          leftV.value = withSpring(clampedLeft, BOX_SPRING);
          rightV.value = withSpring(clampedRight, BOX_SPRING);
          setPhase("found");
          return;
        }
        await wait(MEASURE_RETRY_MS);
      }
      // Never found it — collapse the spotlight box back to nothing (which
      // reads as a plain full-screen dim, see the render below) and fall
      // back to a centered tooltip rather than leaving the tour stuck.
      if (!cancelled) {
        lastRectRef.current = null;
        topV.value = withTiming(0, { duration: COLLAPSE_MS });
        bottomV.value = withTiming(0, { duration: COLLAPSE_MS });
        leftV.value = withTiming(0, { duration: COLLAPSE_MS });
        rightV.value = withTiming(0, { duration: COLLAPSE_MS }, (finished) => {
          if (finished) {
            tooltipOpacity.value = withTiming(1, { duration: TOOLTIP_FADE_IN_MS });
            mascotScale.value = withSpring(1, MASCOT_SPRING);
          }
        });
        setPhase("notfound");
      }
    }

    locateTarget();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepIndex]);

  const topStyle = useAnimatedStyle(() => ({ height: topV.value }));
  const bottomStyle = useAnimatedStyle(() => ({ top: bottomV.value }));
  const leftStyle = useAnimatedStyle(() => ({
    top: topV.value,
    height: bottomV.value - topV.value,
    width: leftV.value,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    top: topV.value,
    height: bottomV.value - topV.value,
    left: rightV.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    top: topV.value,
    left: leftV.value,
    width: rightV.value - leftV.value,
    height: bottomV.value - topV.value,
  }));
  const tooltipFade = useAnimatedStyle(() => ({ opacity: tooltipOpacity.value }));
  const belowStyle = useAnimatedStyle(() => ({ top: bottomV.value + BUBBLE_GAP }));
  const aboveStyle = useAnimatedStyle(() => ({ bottom: screenHeight - topV.value + BUBBLE_GAP }), [screenHeight]);
  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mascotScale.value }],
    opacity: tooltipOpacity.value,
  }));

  if (!visible) return null;

  /** Ends the tour and lands the user back on Home, regardless of which tab (Planner/Community/Explore) it was on — used by both Skip and the final step's "Got it". */
  function endTour() {
    router.navigate(HOME_ROUTE);
    onFinish();
  }

  function handleNext() {
    if (isLastStep) endTour();
    else setStepIndex((i) => i + 1);
  }

  const step = STEPS[stepIndex];
  const nextLabel = isLastStep ? "Got it" : "Next";
  const rect = lastRectRef.current;

  // Bounds-checked placement: pick whichever side of the target actually has
  // more real room (accounting for the safe-area insets, not just raw screen
  // edges), rather than a naive "top half vs bottom half" guess — a target
  // near the bottom of a short device previously got a bubble anchored
  // below it with barely any room, clipping step 3's longer copy off the
  // bottom of the screen. bubbleMaxHeight then caps the bubble to whatever
  // space was actually available on the chosen side, and innerMaxHeight
  // (passed to TooltipContent) reserves room for the mascot header/button so
  // only the title+body region — never the whole bubble — ever needs to
  // scroll internally as a last resort.
  const targetTop = rect ? Math.max(0, rect.y - PAD) : 0;
  const targetBottom = rect ? Math.min(screenHeight, rect.y + rect.height + PAD) : 0;
  const spaceBelow = screenHeight - insets.bottom - BUBBLE_GAP - targetBottom;
  const spaceAbove = targetTop - insets.top - BUBBLE_GAP;
  const placeBelow = rect ? spaceBelow >= spaceAbove : true;
  const bubbleMaxHeight = Math.max(MIN_BUBBLE_ROOM, placeBelow ? spaceBelow : spaceAbove);
  const innerMaxHeight = Math.max(40, bubbleMaxHeight - BUBBLE_CHROME_HEIGHT);

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dim, styles.dimTop, topStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimBottom, bottomStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimLeft, leftStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimRight, rightStyle]} pointerEvents="auto" />
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: colors.primary }, ringStyle]} />

      {phase === "notfound" ? (
        <Animated.View
          style={[
            styles.tooltip,
            styles.tooltipCentered,
            { backgroundColor: colors.card, borderColor: colors.border, maxHeight: screenHeight * 0.45 },
            tooltipFade,
          ]}
        >
          <TooltipContent
            step={step}
            stepIndex={stepIndex}
            colors={colors}
            nextLabel={nextLabel}
            onNext={handleNext}
            mascotStyle={mascotStyle}
            innerMaxHeight={screenHeight * 0.25}
          />
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            styles.tooltip,
            { backgroundColor: colors.card, borderColor: colors.border, maxHeight: bubbleMaxHeight },
            placeBelow ? belowStyle : aboveStyle,
            tooltipFade,
          ]}
        >
          <Animated.View
            style={[
              styles.tail,
              placeBelow ? styles.tailUp : styles.tailDown,
              placeBelow ? { borderBottomColor: colors.card } : { borderTopColor: colors.card },
              tooltipFade,
            ]}
          />
          <TooltipContent
            step={step}
            stepIndex={stepIndex}
            colors={colors}
            nextLabel={nextLabel}
            onNext={handleNext}
            mascotStyle={mascotStyle}
            innerMaxHeight={innerMaxHeight}
          />
        </Animated.View>
      )}

      <TouchableOpacity
        onPress={endTour}
        style={[styles.skipBtn, { top: insets.top + 10 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding tour"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TooltipContent({
  step,
  stepIndex,
  colors,
  nextLabel,
  onNext,
  mascotStyle,
  innerMaxHeight,
}: {
  step: Step;
  stepIndex: number;
  colors: ReturnType<typeof useTheme>["colors"];
  nextLabel: string;
  onNext: () => void;
  mascotStyle: any;
  /** Bound for the scrollable title+body region only — reserving the mascot header and Next/Got it button so those never get pushed off or scrolled away, even on a cramped device. */
  innerMaxHeight: number;
}) {
  return (
    <>
      <View style={styles.mascotRow}>
        <Animated.View style={mascotStyle}>
          <MascotAvatar size={40} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <MascotNameBadge />
          <Text style={[styles.stepCount, { color: colors.secondaryText }]}>
            Step {stepIndex + 1} of {STEPS.length}
          </Text>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
      <ScrollView style={{ maxHeight: innerMaxHeight }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.body, { color: colors.secondaryText }]}>{step.body}</Text>
      </ScrollView>
      <TouchableOpacity
        onPress={onNext}
        style={[styles.nextButton, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
      >
        <Text style={styles.nextText}>{nextLabel}</Text>
        <Ionicons name={nextLabel === "Got it" ? "checkmark" : "arrow-forward"} size={16} color={brand.white} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: brand.overlay },
  dimTop: { top: 0, left: 0, right: 0 },
  dimBottom: { left: 0, right: 0, bottom: 0 },
  dimLeft: { left: 0 },
  dimRight: { right: 0 },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  tooltip: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  tooltipCentered: { top: "42%" },
  tail: {
    position: "absolute",
    alignSelf: "center",
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  // Points up, toward a target above the bubble — sits on the bubble's top edge.
  tailUp: { top: -9, borderBottomWidth: 10 },
  // Points down, toward a target below the bubble — sits on the bubble's bottom edge.
  tailDown: { bottom: -9, borderTopWidth: 10 },
  mascotRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  stepCount: { fontSize: 11, fontWeight: "700", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { fontSize: 19, fontWeight: "800", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  nextButton: {
    flexDirection: "row",
    alignSelf: "flex-end",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  nextText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  skipBtn: {
    position: "absolute",
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  skipText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
