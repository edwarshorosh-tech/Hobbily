/**
 * OnboardingTour — spotlight/coachmark walkthrough shown once after sign-up
 * (post-signup auto-trigger, see app/(tabs)/_layout.tsx) and on demand from
 * Profile > Settings > "Replay App Tour".
 *
 * Architecture:
 *  - Every step names a `targetId` (context/TourTargetsContext.ts's
 *    registry) plus a `targetShape` used to shape the spotlight ring to the
 *    real element (circle for a bare icon button, capsule for a bottom-tab
 *    item, roundedRect for a card/button) rather than one fixed square for
 *    everything.
 *  - Steps whose target lives on a different screen carry a `route` —
 *    locateTarget navigates there first, waits for the lazy tab to mount/
 *    settle, and only then measures. Steps that share a screen with the
 *    previous step skip the navigate+wait entirely (previousRouteRef).
 *  - A step can optionally run `prepareTarget()` once, right after
 *    navigation settles and before the first measurement attempt — used by
 *    the Posts step to switch Profile's own local tab state to "posts" (a
 *    real screen-state change via TourTargetsContext's registered bridge,
 *    not a fake/invented target) so the create-post button has actually
 *    mounted by the time it's measured.
 *  - The instructional card is always bottom-anchored, sitting just above
 *    the bottom tab bar (useTabBarHeight) regardless of what's spotlighted —
 *    this both matches the "always appears from the bottom" requirement and
 *    guarantees it never overlaps a tab-bar target (which sits inside that
 *    reserved space, below the card). It never moves horizontally or
 *    vertically to chase a target; only its opacity/translateY animate, on
 *    every step transition (including the tour's very first appearance),
 *    driven by one shared value (cardShow) doubling as both the initial
 *    "slide up from bottom" entrance and each step's brief hide/reappear.
 *  - No blur library is used for the backdrop: expo-blur isn't an installed
 *    dependency, and adding a new native module for this one visual touch
 *    wasn't judged worth the risk/weight. The fallback the design spec
 *    itself explicitly allows is used instead — a soft, theme-independent
 *    dim (`brand.tourOverlay`, ~42% opacity) — so the screen underneath
 *    stays recognizable without a new dependency.
 *  - All motion (the spotlight cutout, the card's fade/slide, the mascot's
 *    bounce) is driven by Reanimated shared values on the UI thread, so
 *    scroll/measure/navigate work on the JS thread can't make it stutter.
 *  - Reduce Motion (AccessibilityInfo) collapses the spring glide to an
 *    instant snap and the card's slide to a plain opacity fade, with the
 *    mascot bounce and mid-transition dip both suppressed — full
 *    functionality (every step still measures, navigates, and completes)
 *    is unaffected.
 *  - Every measureTarget/measureScrollRoot call is resolved relative to
 *    overlayAnchorRef — a plain View mounted at this overlay's own
 *    absolute-fill root — rather than trusting measureInWindow's raw window
 *    coordinates directly. Both the target and this anchor are measured with
 *    the same primitive (measureInWindow) and diffed by TourTargetsContext;
 *    that cancels a constant Android-only offset (roughly the status bar's
 *    height) that raw measureInWindow alone was confirmed, on real devices,
 *    to land the spotlight short by — see TourTargetsContext.tsx's own
 *    "Measurement history" doc comment for the two approaches that were
 *    tried and failed before this one. Skipping this anchor is what
 *    reintroduces that exact bug, so every call site below passes it.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Platform, ScrollView, Text, TouchableOpacity, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useTourTargets, TourTargetId, TourScrollRootId, TourTargetRect } from "../context/TourTargetsContext";
import { useTabBarHeight } from "../hooks/useTabBarHeight";
import { brand } from "../constants/colors";
import MascotAvatar, { MascotNameBadge } from "./MascotAvatar";

const HOME_ROUTE = "/(tabs)/" as any;

type TargetShape = "circle" | "roundedRect" | "capsule";

type Step = {
  targetId: TourTargetId;
  /** Href to navigate to before measuring — omitted for steps whose target lives on the same screen as the previous step. */
  route?: any;
  /** The screen's registered scroll container this target can be scrolled within — omitted when the target is never inside a scrollable region (e.g. the tab bar). */
  scrollRootId?: TourScrollRootId;
  title: string;
  body: string;
  /** Shapes the spotlight ring to the real element instead of one fixed square for everything. */
  targetShape: TargetShape;
  /** True only for the Posts step — see file header. Handled by name rather than a generic callback field since there's exactly one such case. */
  needsProfilePostsTab?: boolean;
};

const STEPS: Step[] = [
  {
    targetId: "addFriends",
    route: HOME_ROUTE,
    scrollRootId: "home",
    targetShape: "roundedRect",
    title: "Adding Friends",
    body: "Tap here to add friends! You'll see each other's streaks and can cheer each other on to stay motivated.",
  },
  {
    targetId: "plannerAddActivity",
    route: "/(tabs)/time-manager" as any,
    scrollRootId: "planner",
    targetShape: "roundedRect",
    title: "Planner & Adding Activities",
    body: "This is your planner. Tap here to plan an activity — add it yourself, or describe it to Bubble, your AI assistant, and let it help turn it into a scheduled hobby session or task.",
  },
  {
    targetId: "communityTab",
    route: "/(tabs)/community" as any,
    targetShape: "capsule",
    title: "Community",
    body: "Over here is Community — a group chat connecting people with shared interests to talk and share experiences.",
  },
  {
    targetId: "exploreTab",
    route: "/(tabs)/opportunities" as any,
    targetShape: "capsule",
    title: "Explore",
    body: "And Explore is your gateway to finding local places, venues, and open spots — both free and paid — to practice and develop your hobbies.",
  },
  {
    targetId: "profileTab",
    route: "/(tabs)/profile" as any,
    targetShape: "capsule",
    title: "Your Profile",
    body: "Manage your information, hobbies, and how other members see you.",
  },
  {
    targetId: "profilePosts",
    route: "/(tabs)/profile" as any,
    targetShape: "circle",
    title: "Share a Post",
    body: "Create posts, share your hobbies, and connect with the community.",
    needsProfilePostsTab: true,
  },
];

/** Extra breathing room around the real element's measured bounds for the spotlight cutout/ring. */
const PAD = 8;
/** Fixed corner radius used for card/button-shaped targets — circle and capsule targets compute their own radius from the measured rect instead. */
const ROUNDED_RECT_RADIUS = 18;
/** Gap between the card and the bottom tab bar it always sits just above. */
const CARD_BOTTOM_MARGIN = 14;
/** How far the card sits below its resting position while hidden (cardShow.value === 0) — a small dip, not a full off-screen slide, so every step transition (not just the tour's opening) reads as "settling in from below." */
const CARD_DIP = 18;
const CARD_HIDE_MS = 140;
const CARD_SHOW_MS = 260;
/** How long to let a just-triggered navigation (lazy tab mount) settle before the first measurement attempt. */
const NAVIGATION_SETTLE_MS = 450;
const MEASURE_RETRY_MS = 120;
const MAX_MEASURE_ATTEMPTS = 20;
/** Subtle, non-bouncy glide for the spotlight ring — damping/stiffness/mass tuned to land just under critical damping, so a long cross-screen travel still settles smoothly with no overshoot or snap. */
const BOX_SPRING = { damping: 18, stiffness: 90, mass: 0.8 };
/** Playful bounce for Bubble's arrival "pop" — lower damping than BOX_SPRING so it visibly overshoots before settling. Suppressed entirely under Reduce Motion. */
const MASCOT_SPRING = { damping: 9, stiffness: 200, mass: 0.6 };
const MASCOT_SHRINK_SCALE = 0.7;
const COLLAPSE_MS = 260;
/** Minimum clearance to leave between the target and the screen/safe-area edge when deciding whether it's already comfortably in view. */
const SCROLL_MARGIN = 24;
const SCROLL_POLL_MS = 60;
const MAX_SCROLL_SETTLE_ATTEMPTS = 6;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Phase = "measuring" | "found" | "notfound";

type Props = {
  visible: boolean;
  /**
   * Where to return to when the tour ends — null means "first-launch tour",
   * which always lands on Home; a route means "launched manually from that
   * screen" (currently only Profile > Settings), which returns there
   * instead, for both Skip and completing the last step. See
   * context/OnboardingTourContext.tsx's startTour.
   */
  originRoute: string | null;
  onFinish: () => void;
};

export default function OnboardingTour({ visible, originRoute, onFinish }: Props) {
  const { colors } = useTheme();
  const { measureTarget, measureScrollRoot, scrollRootBy, switchProfileTabToPosts } = useTourTargets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("measuring");
  const [reduceMotion, setReduceMotion] = useState(false);
  const lastRectRef = useRef<TourTargetRect | null>(null);
  /** Route the tour last actually navigated to — lets locateTarget skip the navigate+settle wait when consecutive steps share a screen. */
  const previousRouteRef = useRef<any>(null);
  /**
   * A plain View mounted at the overlay's own absolute-fill root, whose only
   * job is to be the second point every measureTarget/measureScrollRoot call
   * measures against (both are measureInWindow-ed and diffed) — see
   * TourTargetsContext's file header for why that eliminates Android's
   * status-bar/safe-area offset entirely instead of correcting for it.
   */
  const overlayAnchorRef = useRef<View>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  // The one shared "truth" for the spotlight box — every dim panel and the
  // ring below reads these same four values, so they can never disagree
  // about where the cutout is mid-animation.
  const topV = useSharedValue(0);
  const bottomV = useSharedValue(0);
  const leftV = useSharedValue(0);
  const rightV = useSharedValue(0);
  /** 0 = card hidden/dipped, 1 = resting and visible — doubles as the tour's opening entrance and every step's brief hide/reappear (see file header). Also drives the mascot's own opacity. */
  const cardShow = useSharedValue(0);
  const mascotScale = useSharedValue(MASCOT_SHRINK_SCALE);

  const isLastStep = stepIndex === STEPS.length - 1;
  const step = STEPS[stepIndex];

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
      cardShow.value = 0;
      mascotScale.value = MASCOT_SHRINK_SCALE;
      return;
    }

    let cancelled = false;
    setPhase("measuring");
    cardShow.value = withTiming(0, { duration: reduceMotion ? 60 : CARD_HIDE_MS });
    mascotScale.value = withTiming(MASCOT_SHRINK_SCALE, { duration: reduceMotion ? 60 : CARD_HIDE_MS });
    const activeStep = STEPS[stepIndex];

    // Explicitly tagged as a worklet (rather than an inline arrow function
    // literal at the withSpring/withTiming call site) because it's handed
    // to those calls *through* the springOrSnap/collapseTo0 helpers below —
    // Reanimated's babel plugin only auto-worklet-izes an inline function
    // literal written directly inside a withTiming(...)/withSpring(...)
    // call; a callback forwarded through a plain parameter like that stays
    // an ordinary JS-thread closure, and invoking it from the UI thread on
    // animation completion throws (crashing the app) rather than running.
    // The explicit "worklet" directive makes this one valid to pass by
    // reference through any number of indirections.
    function onSpotlightSettled(finished?: boolean) {
      "worklet";
      if (!finished) return;
      cardShow.value = withTiming(1, { duration: reduceMotion ? 100 : CARD_SHOW_MS });
      mascotScale.value = reduceMotion ? 1 : withSpring(1, MASCOT_SPRING);
    }

    /**
     * If the target lives inside a registered scroll container and isn't
     * currently within a comfortable margin of the viewport, scrolls it into
     * view and re-measures. The scroll itself is instant/non-animated (see
     * TourTargetsContext's scrollRootBy) so the ring's own spring glide is
     * always travelling toward the target's real, already-settled position.
     */
    async function ensureVisible(rect: TourTargetRect): Promise<TourTargetRect> {
      if (!activeStep.scrollRootId) return rect;
      const containerRect = await measureScrollRoot(activeStep.scrollRootId, overlayAnchorRef.current);
      if (!containerRect) return rect;

      const viewTop = containerRect.y + SCROLL_MARGIN;
      const viewBottom = containerRect.y + containerRect.height - SCROLL_MARGIN;
      const isVisible = (r: TourTargetRect) => r.y >= viewTop && r.y + r.height <= viewBottom;
      if (isVisible(rect)) return rect;

      scrollRootBy(activeStep.scrollRootId, rect.y - viewTop);

      let previous: TourTargetRect | null = null;
      for (let attempt = 0; attempt < MAX_SCROLL_SETTLE_ATTEMPTS; attempt++) {
        await wait(SCROLL_POLL_MS);
        if (cancelled) return previous ?? rect;
        const measured = await measureTarget(activeStep.targetId, overlayAnchorRef.current);
        if (!measured) break;
        if (previous && Math.abs(measured.y - previous.y) < 1) return measured;
        previous = measured;
      }
      return previous ?? rect;
    }

    async function locateTarget() {
      if (activeStep.route && activeStep.route !== previousRouteRef.current) {
        router.navigate(activeStep.route);
        await wait(NAVIGATION_SETTLE_MS);
      }
      if (activeStep.route) previousRouteRef.current = activeStep.route;
      if (cancelled) return;

      // A real screen-state change (Profile's own tab), not a fake target —
      // see file header and TourTargetsContext's useRegisterProfilePostsTabSwitch.
      if (activeStep.needsProfilePostsTab) switchProfileTabToPosts();

      for (let attempt = 0; attempt < MAX_MEASURE_ATTEMPTS; attempt++) {
        if (cancelled) return;
        let rect = await measureTarget(activeStep.targetId, overlayAnchorRef.current);
        if (rect) {
          if (cancelled) return;
          rect = await ensureVisible(rect);
          if (cancelled) return;
          lastRectRef.current = rect;

          const clampedTop = Math.max(0, rect.y - PAD);
          const clampedBottom = Math.min(screenHeight, rect.y + rect.height + PAD);
          const clampedLeft = Math.max(0, rect.x - PAD);
          const clampedRight = Math.min(screenWidth, rect.x + rect.width + PAD);

          const springOrSnap = (target: number, onDone?: (finished?: boolean) => void) =>
            reduceMotion ? withTiming(target, { duration: 0 }, onDone) : withSpring(target, BOX_SPRING, onDone);

          topV.value = springOrSnap(clampedTop, onSpotlightSettled);
          bottomV.value = springOrSnap(clampedBottom);
          leftV.value = springOrSnap(clampedLeft);
          rightV.value = springOrSnap(clampedRight);
          setPhase("found");
          announceStep(activeStep, stepIndex);
          return;
        }
        await wait(MEASURE_RETRY_MS);
      }
      // Never found it — collapse the spotlight box back to nothing (reads
      // as a plain full-screen dim) and fall back to the same bottom-anchored
      // card with no cutout, rather than leaving the tour stuck or showing a
      // ring at (0,0).
      if (!cancelled) {
        lastRectRef.current = null;
        const collapse = (v: typeof topV, onDone?: (finished?: boolean) => void) =>
          (v.value = withTiming(0, { duration: reduceMotion ? 0 : COLLAPSE_MS }, onDone));
        collapse(topV, onSpotlightSettled);
        collapse(bottomV);
        collapse(leftV);
        collapse(rightV);
        setPhase("notfound");
        announceStep(activeStep, stepIndex);
      }
    }

    function announceStep(s: Step, idx: number) {
      AccessibilityInfo.announceForAccessibility?.(`Step ${idx + 1} of ${STEPS.length}. ${s.title}.`);
    }

    locateTarget();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepIndex]);

  // Android hardware back: steps back through the tour instead of leaving
  // the screen or exiting the app; from the first step it ends the tour the
  // same way Skip does (return to originRoute/Home) rather than doing
  // nothing or closing the app unexpectedly.
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stepIndex > 0) setStepIndex((i) => Math.max(0, i - 1));
      else endTour();
      return true;
    });
    return () => sub.remove();
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
  const ringStyle = useAnimatedStyle(() => {
    const w = rightV.value - leftV.value;
    const h = bottomV.value - topV.value;
    const shape = STEPS[stepIndex].targetShape;
    const radius = shape === "circle" ? Math.min(w, h) / 2 : shape === "capsule" ? h / 2 : ROUNDED_RECT_RADIUS;
    return { top: topV.value, left: leftV.value, width: w, height: h, borderRadius: Math.max(0, radius) };
  });
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardShow.value,
    transform: [{ translateY: (1 - cardShow.value) * (reduceMotion ? 0 : CARD_DIP) }],
  }));
  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mascotScale.value }],
    opacity: cardShow.value,
  }));

  if (!visible) return null;

  /** Ends the tour and returns to wherever it should — originRoute for a manually-launched tour, Home for the first-launch tour. Used by Skip, Android Back on step 1, and the final step's "Got it". */
  function endTour() {
    router.navigate(originRoute ?? HOME_ROUTE);
    onFinish();
  }

  function handleNext() {
    if (phase === "measuring") return;
    if (isLastStep) endTour();
    else setStepIndex((i) => i + 1);
  }

  function handleBack() {
    if (phase === "measuring" || stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  const nextLabel = isLastStep ? "Got it" : "Next";
  const cardMaxHeight = Math.min(340, screenHeight * 0.44);

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
      <View
        ref={overlayAnchorRef}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        collapsable={false}
      />
      <Animated.View style={[styles.dim, styles.dimTop, topStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimBottom, bottomStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimLeft, leftStyle]} pointerEvents="auto" />
      <Animated.View style={[styles.dim, styles.dimRight, rightStyle]} pointerEvents="auto" />
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />

      <Animated.View
        style={[
          styles.cardWrap,
          { bottom: tabBarHeight + CARD_BOTTOM_MARGIN, paddingHorizontal: 20 },
          cardStyle,
        ]}
      >
        <Animated.View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: Math.min(560, screenWidth - 40) }]}
        >
          <ScrollView style={{ maxHeight: cardMaxHeight }} showsVerticalScrollIndicator={false}>
            <Animated.View style={styles.mascotRow}>
              <Animated.View style={[styles.mascotFlexGuard, mascotStyle]}>
                <MascotAvatar size={40} />
              </Animated.View>
              <Animated.View style={styles.mascotTextCol}>
                <MascotNameBadge />
                <Text style={[styles.stepCount, { color: colors.secondaryText }]}>
                  Step {stepIndex + 1} of {STEPS.length}
                </Text>
              </Animated.View>
            </Animated.View>
            <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: colors.secondaryText }]}>{step.body}</Text>
          </ScrollView>

          <Animated.View style={styles.buttonRow}>
            {stepIndex > 0 && (
              <TouchableOpacity
                onPress={handleBack}
                disabled={phase === "measuring"}
                style={[styles.backButton, { borderColor: colors.border, opacity: phase === "measuring" ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Back"
                accessibilityState={{ disabled: phase === "measuring" }}
              >
                <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleNext}
              disabled={phase === "measuring"}
              style={[styles.nextButton, { backgroundColor: colors.primary, opacity: phase === "measuring" ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={nextLabel}
              accessibilityState={{ disabled: phase === "measuring" }}
            >
              <Text style={styles.nextText}>{nextLabel}</Text>
              <Ionicons name={nextLabel === "Got it" ? "checkmark" : "arrow-forward"} size={16} color={brand.white} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <TouchableOpacity
        onPress={endTour}
        style={[styles.skipBtn, { top: insets.top + 14 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding tour"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: brand.tourOverlay },
  dimTop: { top: 0, left: 0, right: 0 },
  dimBottom: { left: 0, right: 0, bottom: 0 },
  dimLeft: { left: 0 },
  dimRight: { right: 0 },
  ring: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: brand.mascotPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  // Always anchored just above the tab bar (bottom set inline) — never
  // repositions to chase a target; only opacity/translateY animate.
  cardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    width: "100%",
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  mascotRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  mascotFlexGuard: { flexShrink: 0 },
  mascotTextCol: { flex: 1, minWidth: 0 },
  stepCount: { fontSize: 11, fontWeight: "700", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { fontSize: 19, fontWeight: "800", lineHeight: 24, marginBottom: 8, flexWrap: "wrap" },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 4, flexWrap: "wrap" },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  backButton: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 15, fontWeight: "700" },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 44,
  },
  nextText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  skipBtn: {
    position: "absolute",
    right: 16,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  skipText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
