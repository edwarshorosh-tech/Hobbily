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
 * A target can also be scrolled out of view within its own screen (e.g. Home's
 * Friends Leaderboard, below the fold on a short device) — steps on such a
 * screen carry a `scrollRootId` naming that screen's registered scroll
 * container (see context/TourTargetsContext.ts's useTourScrollRoot), and
 * ensureVisible() scrolls it into a safe margin and re-measures before the
 * spotlight is ever animated toward it. The scroll itself is instant/
 * non-animated, not a multi-frame slide — see ensureVisible's own comment.
 *
 * Bubble layout & positioning: the speech bubble has a fixed-feeling size
 * (maxWidth '85%', minWidth 260, fixed padding — see styles.tooltip) and its
 * text flows/wraps naturally instead of being squeezed into a computed
 * "available space" budget — that budget calculation used to drift out of
 * sync with the bubble's real rendered chrome height and squeeze the body
 * text down to almost nothing. Its position is one continuous (x is always
 * centered; y is the only thing that moves) coordinate — bubbleTopV — computed
 * *once* per step change in locateTarget (below/above the target, whichever
 * has more room, clamped to the safe viewport) and animated with a single
 * withSpring, so a placement flip between steps is still a smooth glide
 * along the same `top` property rather than a discrete swap between `top`
 * and `bottom` (which can't be interpolated and reads as a snap). bubbleTopV
 * is refined once via onLayout after the bubble's real height is known (only
 * matters when placed above the target, where the top edge depends on that
 * height) — a small follow-up spring, not a re-render of the bubble itself.
 *
 * All motion (the spotlight cutout's position/size, the tooltip's position/
 * fade, the mascot's bounce) is driven entirely by Reanimated shared values
 * updated with withSpring/withTiming — never by re-rendering with new inline
 * numbers — so every frame of a transition runs on the UI thread, unaffected
 * by JS thread/bridge load (Metro-over-tunnel included). The four dim panels
 * and the highlight ring all read the *same* four shared values (top/bottom/
 * left/right), which is what guarantees they can never drift out of sync
 * with each other mid-animation.
 *
 * Transition choreography: moving to a new step immediately fades the
 * tooltip out; the spotlight box and bubble only start gliding (withSpring)
 * toward the new target once it's actually been measured (navigation/lazy-
 * mount time is however long it takes), and the tooltip fades back in
 * exactly when the box's glide settles — never before, so it's never visible
 * pointing at a stale or mid-flight position. The navigate-and-wait for a
 * step's target screen (NAVIGATION_SETTLE_MS) only runs when that screen
 * actually differs from the previous step's (previousRouteRef) — consecutive
 * steps that share a screen (Steps 1 and 2, both Home) skip it entirely, so
 * there's no artificial dead time between the fade-out and the glide for a
 * "navigation" that was never going to happen.
 *
 * Skip (pinned top-right) and Get Started/"Got it" (last step) both end the
 * tour the same way: persist completion via onFinish and land the user back
 * on Home, regardless of which tab the tour was on when it ended.
 *
 * The tooltip is styled as a speech bubble "spoken" by Bubble, a small mascot
 * avatar embedded in the bubble's own header — so it moves as one glued-
 * together unit with the bubble rather than needing its own separate
 * position to keep in sync. Bubble gets a playful little bounce (mascotScale,
 * a bouncier spring than the box's) each time it arrives at a new step, timed
 * off the same spring-completion callback that fades the bubble back in.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useTourTargets, TourTargetId, TourScrollRootId, TourTargetRect } from "../context/TourTargetsContext";
import { brand } from "../constants/colors";
import MascotAvatar, { MascotNameBadge } from "./MascotAvatar";

const HOME_ROUTE = "/(tabs)/" as any;

type Step = {
  targetId: TourTargetId;
  /** Href to navigate to before measuring — omitted for steps whose target (the tab bar) is visible from any current screen. */
  route?: any;
  /** The screen's registered scroll container this target can be scrolled within — omitted for steps whose target (the tab bar) is never inside a scrollable region. */
  scrollRootId?: TourScrollRootId;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    targetId: "aiAssistant",
    route: HOME_ROUTE,
    scrollRootId: "home",
    title: "AI Assistant",
    body: "Hi, I'm Bubble! I'm your AI assistant — chat with me here to discover new hobbies, talk through your plans, or just say \"add it\" and I'll schedule an activity for you.",
  },
  {
    targetId: "addFriends",
    route: HOME_ROUTE,
    scrollRootId: "home",
    title: "Adding Friends",
    body: "Tap here to add friends! You'll see each other's streaks and can cheer each other on to stay motivated.",
  },
  {
    targetId: "plannerAddActivity",
    route: "/(tabs)/time-manager" as any,
    scrollRootId: "planner",
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
/** Minimum clearance to keep between the bubble and the top/bottom safe-area edges — the final safety clamp on bubbleTopV, independent of which side it was placed on. */
const BUBBLE_EDGE_MARGIN = 16;
/** Best-guess bubble height used only until the very first onLayout reports the real one — close enough for the "place above" math to land in the right neighborhood before the follow-up spring corrects it exactly. */
const DEFAULT_BUBBLE_HEIGHT = 220;
/** How long to let a just-triggered navigation (lazy tab mount, or an in-page auto-scroll) settle before the first measurement attempt. */
const NAVIGATION_SETTLE_MS = 450;
const MEASURE_RETRY_MS = 120;
const MAX_MEASURE_ATTEMPTS = 20;
/** Subtle, non-bouncy glide for the spotlight box and bubble position — damping/stiffness/mass tuned to land just under critical damping, so a long cross-screen travel (e.g. Step 1 to Step 2) still settles smoothly with no overshoot or snap. */
const BOX_SPRING = { damping: 18, stiffness: 90, mass: 0.8 };
/** Playful bounce for Bubble's arrival "pop" — lower damping than BOX_SPRING so it visibly overshoots before settling. */
const MASCOT_SPRING = { damping: 9, stiffness: 200, mass: 0.6 };
const MASCOT_SHRINK_SCALE = 0.7;
const TOOLTIP_FADE_OUT_MS = 120;
const TOOLTIP_FADE_IN_MS = 150;
const COLLAPSE_MS = 260;
/** Minimum clearance to leave between the target and the screen/safe-area edge when deciding whether it's already comfortably in view. */
const SCROLL_MARGIN = 24;
/** How often to re-measure while confirming an (instant, non-animated — see TourTargetsContext's scrollRootBy) auto-scroll has actually landed. */
const SCROLL_POLL_MS = 60;
/** Bounded polling budget — generous even though the scroll itself is instant, purely to cover the layout/measure round-trip. */
const MAX_SCROLL_SETTLE_ATTEMPTS = 6;

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
  const { measureTarget, measureScrollRoot, scrollRootBy } = useTourTargets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("measuring");
  /** Which side of the target the bubble is currently placed on — only read to pick the tail's arrow direction, a small discrete decorative flip that doesn't need to be animated itself. */
  const [placedBelow, setPlacedBelow] = useState(true);
  const placedBelowRef = useRef(true);
  const lastRectRef = useRef<TourTargetRect | null>(null);
  /** Real rendered bubble height, refined by TooltipContent's onLayout — only matters for the "place above" case, where the bubble's top edge depends on its own height. */
  const bubbleHeightRef = useRef(DEFAULT_BUBBLE_HEIGHT);
  /** Route the tour last actually navigated to — lets locateTarget skip the navigate+settle wait when consecutive steps share a route (e.g. Step 1→2, both on Home), instead of paying a fixed 450ms of dead time for a "navigation" that never really happens. */
  const previousRouteRef = useRef<any>(null);

  // The one shared "truth" for the spotlight box — every dim panel and the
  // ring below reads these same four values, so they can never disagree
  // about where the cutout is mid-animation.
  const topV = useSharedValue(0);
  const bottomV = useSharedValue(0);
  const leftV = useSharedValue(0);
  const rightV = useSharedValue(0);
  const tooltipOpacity = useSharedValue(0);
  const mascotScale = useSharedValue(MASCOT_SHRINK_SCALE);
  /** The bubble's own absolute top-edge position — the single continuous coordinate its whole motion boils down to (see file header). */
  const bubbleTopV = useSharedValue(0);

  const isLastStep = stepIndex === STEPS.length - 1;

  /** Computes where the bubble's top edge should land for the given target rect + estimated bubble height, clamped to stay within the safe viewport no matter what. Pure — callers decide what to do with the result. */
  function computeBubbleTop(rect: TourTargetRect, bubbleHeight: number) {
    const clampedTop = Math.max(0, rect.y - PAD);
    const clampedBottom = Math.min(screenHeight, rect.y + rect.height + PAD);
    const spaceBelow = screenHeight - insets.bottom - BUBBLE_GAP - clampedBottom;
    const spaceAbove = clampedTop - insets.top - BUBBLE_GAP;
    const below = spaceBelow >= spaceAbove;
    const rawTop = below ? clampedBottom + BUBBLE_GAP : clampedTop - BUBBLE_GAP - bubbleHeight;
    const minTop = insets.top + BUBBLE_EDGE_MARGIN;
    const maxTop = Math.max(minTop, screenHeight - insets.bottom - BUBBLE_EDGE_MARGIN - bubbleHeight);
    return { below, top: Math.min(Math.max(rawTop, minTop), maxTop) };
  }

  /** TooltipContent reports its real rendered height here once laid out — only triggers a follow-up spring when it actually differs from the estimate used so far, and only when that estimate mattered (placed above the target). */
  function handleBubbleLayout(e: LayoutChangeEvent) {
    const height = e.nativeEvent.layout.height;
    if (Math.abs(height - bubbleHeightRef.current) < 1) return;
    bubbleHeightRef.current = height;
    if (placedBelowRef.current) return;
    const rect = lastRectRef.current;
    if (!rect) return;
    const { top } = computeBubbleTop(rect, height);
    bubbleTopV.value = withSpring(top, BOX_SPRING);
  }

  useEffect(() => {
    if (!visible) {
      setStepIndex(0);
      setPhase("measuring");
      lastRectRef.current = null;
      previousRouteRef.current = null;
      topV.value = 0;
      bottomV.value = 0;
      leftV.value = 0;
      rightV.value = 0;
      bubbleTopV.value = 0;
      tooltipOpacity.value = 0;
      mascotScale.value = MASCOT_SHRINK_SCALE;
      return;
    }

    let cancelled = false;
    setPhase("measuring");
    tooltipOpacity.value = withTiming(0, { duration: TOOLTIP_FADE_OUT_MS });
    mascotScale.value = withTiming(MASCOT_SHRINK_SCALE, { duration: TOOLTIP_FADE_OUT_MS });
    const step = STEPS[stepIndex];

    /**
     * If the target lives inside a registered scroll container and isn't
     * currently within a comfortable margin of the viewport, scrolls it into
     * view and re-measures. Computed as a delta against the root's own last-
     * tracked offset (scrollRootBy), not an absolute position — RN gives no
     * synchronous "current scroll offset" getter, only the running tally each
     * screen's own onScroll keeps (see useTourScrollRoot).
     *
     * The scroll itself (scrollRootBy) is non-animated — instant, not a
     * multi-frame slide — specifically so the box below can glide (withSpring,
     * in locateTarget) in one continuous motion straight from the *previous*
     * step's position to this one's real, final, already-settled position,
     * the same smooth swipe-like feel every other transition has. An
     * *animated* scroll here would fight that: it has no fixed duration (it
     * scales with distance) and no completion callback, so the box could end
     * up gliding toward a target that was still itself mid-scroll — sized
     * against a transitional position rather than where it actually lands.
     * An instant jump removes that window entirely.
     */
    async function ensureVisible(rect: TourTargetRect): Promise<TourTargetRect> {
      if (!step.scrollRootId) return rect;
      const containerRect = await measureScrollRoot(step.scrollRootId);
      if (!containerRect) return rect;

      const viewTop = containerRect.y + SCROLL_MARGIN;
      const viewBottom = containerRect.y + containerRect.height - SCROLL_MARGIN;
      const isVisible = (r: TourTargetRect) => r.y >= viewTop && r.y + r.height <= viewBottom;
      if (isVisible(rect)) return rect;

      scrollRootBy(step.scrollRootId, rect.y - viewTop);

      let previous: TourTargetRect | null = null;
      for (let attempt = 0; attempt < MAX_SCROLL_SETTLE_ATTEMPTS; attempt++) {
        await wait(SCROLL_POLL_MS);
        if (cancelled) return previous ?? rect;
        const measured = await measureTarget(step.targetId);
        if (!measured) break;
        if (previous && Math.abs(measured.y - previous.y) < 1) return measured;
        previous = measured;
      }
      return previous ?? rect;
    }

    async function locateTarget() {
      // Only pay the navigate+settle cost when this step's target actually
      // lives on a different screen than the one already showing — Steps 1
      // and 2 both target Home, so re-navigating there and then waiting
      // NAVIGATION_SETTLE_MS for a navigation that never happens was pure
      // dead time between the tooltip's fade-out and the box starting to
      // glide, which is what read as a jerky/laggy stall on that transition
      // specifically. Both targets are already mounted and visible in that
      // case, so measuring can start immediately instead.
      if (step.route && step.route !== previousRouteRef.current) {
        router.navigate(step.route);
        await wait(NAVIGATION_SETTLE_MS);
      }
      if (step.route) previousRouteRef.current = step.route;
      for (let attempt = 0; attempt < MAX_MEASURE_ATTEMPTS; attempt++) {
        if (cancelled) return;
        let rect = await measureTarget(step.targetId);
        if (rect) {
          if (cancelled) return;
          rect = await ensureVisible(rect);
          if (cancelled) return;
          lastRectRef.current = rect;

          const clampedTop = Math.max(0, rect.y - PAD);
          const clampedBottom = Math.min(screenHeight, rect.y + rect.height + PAD);
          const clampedLeft = Math.max(0, rect.x - PAD);
          const clampedRight = Math.min(screenWidth, rect.x + rect.width + PAD);

          const { below, top: bubbleTop } = computeBubbleTop(rect, bubbleHeightRef.current);
          placedBelowRef.current = below;
          setPlacedBelow(below);
          bubbleTopV.value = withSpring(bubbleTop, BOX_SPRING);

          // Only one of the box springs needs the completion callback —
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
  // The bubble's entire motion is this one property — a placement flip
  // between steps is still a continuous glide along `top`, never a discrete
  // swap to `bottom` (which can't be interpolated and reads as a snap).
  const bubblePositionStyle = useAnimatedStyle(() => ({ top: bubbleTopV.value }));
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

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dim, styles.dimTop, topStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimBottom, bottomStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimLeft, leftStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimRight, rightStyle]} pointerEvents="auto" />
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: colors.primary }, ringStyle]} />

      {phase === "notfound" ? (
        <Animated.View
          style={[styles.bubbleWrap, styles.bubbleWrapCentered, tooltipFade]}
        >
          <View
            onLayout={handleBubbleLayout}
            style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <TooltipContent
              step={step}
              stepIndex={stepIndex}
              colors={colors}
              nextLabel={nextLabel}
              onNext={handleNext}
              mascotStyle={mascotStyle}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.bubbleWrap, bubblePositionStyle, tooltipFade]}>
          <View
            onLayout={handleBubbleLayout}
            style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View
              style={[
                styles.tail,
                placedBelow ? styles.tailUp : styles.tailDown,
                placedBelow ? { borderBottomColor: colors.card } : { borderTopColor: colors.card },
              ]}
            />
            <TooltipContent
              step={step}
              stepIndex={stepIndex}
              colors={colors}
              nextLabel={nextLabel}
              onNext={handleNext}
              mascotStyle={mascotStyle}
            />
          </View>
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
}: {
  step: Step;
  stepIndex: number;
  colors: ReturnType<typeof useTheme>["colors"];
  nextLabel: string;
  onNext: () => void;
  mascotStyle: any;
}) {
  return (
    <>
      <View style={styles.mascotRow}>
        <Animated.View style={[styles.mascotFlexGuard, mascotStyle]}>
          <MascotAvatar size={40} />
        </Animated.View>
        <View style={styles.mascotTextCol}>
          <MascotNameBadge />
          <Text style={[styles.stepCount, { color: colors.secondaryText }]}>
            Step {stepIndex + 1} of {STEPS.length}
          </Text>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
      <Text style={[styles.body, { color: colors.secondaryText }]}>{step.body}</Text>
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
  // Full-width, transparent positioning wrapper — its own `top` is the one
  // animated coordinate (bubblePositionStyle); the actual card inside is
  // centered horizontally and bounded to a fixed-feeling size regardless of
  // where its target sits, so it can never get squeezed against a screen
  // edge or the bottom tab bar.
  bubbleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bubbleWrapCentered: { top: "42%" },
  tooltip: {
    maxWidth: "85%",
    minWidth: 260,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
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
  // Neither the avatar nor (via the outer tooltip's own flexShrink:0) the
  // bubble itself ever gives up its size to fit cramped space — the body
  // text is the only thing that flows/wraps to accommodate the content.
  mascotFlexGuard: { flexShrink: 0 },
  mascotTextCol: { flex: 1, minWidth: 0 },
  stepCount: { fontSize: 11, fontWeight: "700", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { fontSize: 19, fontWeight: "800", lineHeight: 24, marginBottom: 8, flexWrap: "wrap" },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 16, flexWrap: "wrap" },
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
