/**
 * InlinePageDisclaimer — the short "what this page is for" hint shown at the
 * very top of a main screen's own content, directly above its title. Each of
 * the 5 main tabs mounts one of these with its own `screenKey`
 * (constants/disclaimers.ts's `route` field) — this is NOT the old global,
 * absolutely-positioned DisclaimerOverlay (removed): it takes part in normal
 * layout flow like any other block, never floats over content, never dims
 * the screen, and never blocks touches.
 *
 * Dismissal persists immediately (ProfileContext.dismissDisclaimer, keyed by
 * `${id}_v${version}` — see constants/disclaimers.ts), independently per
 * screenKey and per account, and survives restart. The close animation runs
 * entirely on the UI thread (Reanimated) and only unmounts once it's
 * actually finished, so the page title above it slides up smoothly instead
 * of jumping.
 */
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, LayoutChangeEvent, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import { useAuth } from "../../context/AuthContext";
import { DisclaimerDef, disclaimerKey, disclaimersForRoute } from "../../constants/disclaimers";

type Props = {
  /** Matches a DisclaimerDef's `route` in constants/disclaimers.ts, e.g. "/", "/time-manager", "/community". */
  screenKey: string;
  colors: ColorTokens;
};

const OPACITY_DURATION = 160;
const TRANSLATE_DURATION = 180;
const COLLAPSE_DURATION = 250;

export default function InlinePageDisclaimer({ screenKey, colors }: Props) {
  const { user } = useAuth();
  const { profile, dismissDisclaimer } = useProfile();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [goneCompletely, setGoneCompletely] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const heightProgress = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
  }, []);

  const candidates = disclaimersForRoute(screenKey);
  const liveCurrent = user ? candidates.find((d) => !profile.dismissedDisclaimers[disclaimerKey(d)]) ?? null : null;

  // Frozen separately from liveCurrent: dismissDisclaimer() below updates
  // profile.dismissedDisclaimers immediately (by design — see its own doc
  // comment — so a later screen's queue can advance without waiting for the
  // round trip), which flips liveCurrent to null right away. Re-deriving
  // `current` straight from that on every render meant the very next
  // render after tapping dismiss already saw `current === null` and hit the
  // `!current` early-return below — unmounting instantly, before the
  // 160-250ms close animation had any chance to actually play. Freezing the
  // displayed disclaimer while `dismissing` is true lets the animation run
  // to completion against the one the user actually dismissed; the effect
  // still tracks liveCurrent normally the rest of the time (e.g. profile
  // data arriving after mount).
  const [current, setCurrent] = useState<DisclaimerDef | null>(liveCurrent);
  useEffect(() => {
    if (!dismissing) setCurrent(liveCurrent);
  }, [liveCurrent, dismissing]);

  // Only ever measure the natural height once — re-measuring on every layout
  // pass (including the ones the collapse animation itself produces once
  // `height` starts being driven by heightProgress) would fight the
  // animation instead of just providing its starting point.
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (measuredHeight === null) setMeasuredHeight(e.nativeEvent.layout.height);
    },
    [measuredHeight]
  );

  function handleDismiss() {
    if (!current) return;
    setDismissing(true);
    dismissDisclaimer(disclaimerKey(current));

    if (reduceMotion) {
      setGoneCompletely(true);
      return;
    }
    opacity.value = withTiming(0, { duration: OPACITY_DURATION, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(-6, { duration: TRANSLATE_DURATION, easing: Easing.out(Easing.cubic) });
    heightProgress.value = withTiming(0, { duration: COLLAPSE_DURATION, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setGoneCompletely)(true);
    });
  }

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
    height: measuredHeight === null ? undefined : heightProgress.value * measuredHeight,
    marginBottom: measuredHeight === null ? undefined : heightProgress.value * 12,
  }));

  if (!current || goneCompletely) return null;

  return (
    <Animated.View style={[styles.collapseWrap, animatedStyle]}>
      <View
        onLayout={handleLayout}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="summary"
      >
        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name={current.icon as any} size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
          <Text style={[styles.description, { color: colors.secondaryText }]}>{current.description}</Text>
          {current.actionLabel && current.actionRoute && (
            <TouchableOpacity
              onPress={() => router.push(current.actionRoute as any)}
              accessibilityRole="button"
              accessibilityLabel={current.actionLabel}
              style={{ marginTop: 6 }}
            >
              <Text style={[styles.actionText, { color: colors.primary }]}>{current.actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${current.title} page tip`}
        >
          <Ionicons name="close" size={17} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  collapseWrap: { overflow: "hidden" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 13.5, fontWeight: "700" },
  description: { fontSize: 12, lineHeight: 16.5, marginTop: 2 },
  actionText: { fontSize: 12, fontWeight: "700" },
  // A visually-small X (17px icon) still gets a real >=44dp touch target via
  // this padding + the hitSlop above, rather than only one of the two.
  closeBtn: { padding: 6, minWidth: 30, minHeight: 30, alignItems: "center", justifyContent: "center" },
});
