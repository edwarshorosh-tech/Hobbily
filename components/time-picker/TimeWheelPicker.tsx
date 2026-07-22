/**
 * TimeWheelPicker — the app's one structured time input, replacing the old
 * freeform "HH:MM" text field that let Planner save impossible times like
 * "12:66" or "90:0" (and, when the user stopped typing after 1-2 digits,
 * incomplete values like "9" that later crashed Home's formatTime). Every
 * value this component can produce is already a valid NormalizedTime — there
 * is no code path back to a free-text string until formatTimeString() is
 * called on a value that has already passed through here.
 *
 * The ScrollView is react-native-gesture-handler's, not React Native's core
 * one. This whole picker lives inside BottomSheet's own
 * GestureHandlerRootView (needed for the sheet's swipe-to-close handle) —
 * and a plain core ScrollView nested inside a GestureHandlerRootView is a
 * known Android-specific trap: Android's native touch-interception model
 * routes gestures through RNGH's arbitration once that root view exists, so
 * a scrollable that isn't itself gesture-handler-aware can simply stop
 * receiving drag touches at all, while iOS's gesture system doesn't have
 * this problem (exactly why this used to work on iOS and not Android).
 * RNGH's own ScrollView is a drop-in replacement built to participate in
 * that arbitration correctly, with the same props/behavior otherwise —
 * still no virtualization (a wheel only ever holds at most 60 items, so a
 * FlatList buys nothing, and one would break RN's windowing by nesting
 * inside the Add/Edit Activity sheet's own vertical ScrollView anyway).
 *
 * The live "which row is under the selector" highlight is a shared value
 * (`scrollY`) written from the normal onScroll callback and read by each
 * row's own useAnimatedStyle — cheap enough on both platforms that it never
 * triggers a React re-render, regardless of row count.
 *
 * Programmatic repositioning (step-button presses, the snap-to-item after a
 * drag ends, and syncing to an externally-changed value) is driven by
 * Reanimated (the same `scrollY` shared value animated with withTiming,
 * applied every frame via scrollTo in a useAnimatedReaction) instead of the
 * ScrollView's own built-in `scrollTo({animated: true})`. That built-in
 * animation has a fixed, non-configurable duration and, more importantly,
 * doesn't reliably let a new call redirect one already in flight — which is
 * what made spamming the +/- buttons feel "stuck": each press's animation
 * had to finish before the next one visibly started. A Reanimated-driven
 * target can be reassigned mid-flight at any time and it smoothly redirects
 * from wherever it currently is, so rapid presses read as one continuous
 * glide through every intermediate number instead of a queue of separate
 * hops.
 *
 * Deliberately one shared value, not two: an earlier version kept a
 * separate "animation target" value that only ever changed when this
 * component itself commanded a scroll, never during a real finger-drag —
 * so after dragging the wheel by hand, the next programmatic move (the
 * post-drag snap-to-exact-item correction) animated from that stale
 * pre-drag position instead of from where the finger actually left it,
 * i.e. it visibly snapped back to the old value before animating to the
 * new one. Using `scrollY` itself as the animation target means it's
 * always current — updated live by onScroll during a real drag — so any
 * subsequent animation starts from the true position. A `isTouchingSV`
 * shared value gates the reaction so it never fights a live touch by
 * commanding a scroll while the user's finger is still down. A second flag,
 * `isProgrammaticAnimating`, gates the onScroll handler itself so the real
 * scroll events that our own programmatic animation's scrollTo commands
 * generate don't feed a stale value back into `scrollY` and fight the
 * withTiming animation currently driving it (see its own comment below).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  SharedValue,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { NormalizedTime, isValidHour, isValidMinute } from "../../utils/time";

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PADDING_COUNT = Math.floor(VISIBLE_ITEMS / 2);

/** Fast and always-interruptible — this is what makes rapid +/- presses feel adaptive instead of queued. */
const STEP_DURATION = 100;
/** Slightly softer settle after a real finger-drag release. */
const COMMIT_DURATION = 150;
/** For syncing to a value that changed from outside this component (e.g. opening the sheet in edit mode). */
const EXTERNAL_SYNC_DURATION = 220;

type WheelItemProps = {
  item: number;
  index: number;
  /** Live scroll offset in px, shared with the parent ScrollView's handler — read here in a worklet, never via React state/props. */
  scrollY: SharedValue<number>;
  formatLabel: (v: number) => string;
  colors: ColorTokens;
};

/**
 * Its color/weight are computed in a UI-thread worklet from `scrollY`
 * directly, so scrolling never triggers a React re-render of this row (or
 * any other) at all.
 */
function WheelItem({ item, index, scrollY, formatLabel, colors }: WheelItemProps) {
  const style = useAnimatedStyle(() => {
    const isSelected = Math.round(scrollY.value / ITEM_HEIGHT) === index;
    return {
      color: isSelected ? colors.primary : colors.secondaryText,
      fontWeight: isSelected ? "800" : "500",
    };
  });
  return (
    <View style={styles.wheelItem}>
      <Animated.Text style={[styles.wheelItemText, style]}>{formatLabel(item)}</Animated.Text>
    </View>
  );
}

type WheelColumnProps = {
  values: number[];
  selectedValue: number;
  formatLabel: (v: number) => string;
  onChange: (v: number) => void;
  colors: ColorTokens;
  accessibilityLabel: string;
  disabled?: boolean;
  reduceMotion: boolean;
};

function WheelColumn({
  values,
  selectedValue,
  formatLabel,
  onChange,
  colors,
  accessibilityLabel,
  disabled,
  reduceMotion,
}: WheelColumnProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // True for the entire span of a touch — from the first finger-down move to
  // the native snap animation actually finishing. While true, nothing here
  // is allowed to command a scroll: issuing one while the native pan gesture
  // is still live is exactly what used to freeze the wheel (Android's
  // gesture responder gets a scroll command and a live touch fighting over
  // the same ScrollView and stops responding to further input) — closing
  // the whole sheet was the only way out.
  const isTouching = useRef(false);
  // Worklet-readable mirror of `isTouching` — the reaction below runs on the
  // UI thread and can't read a plain JS ref.
  const isTouchingSV = useSharedValue(false);
  const hasMounted = useRef(false);
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));

  // Live scroll offset AND the animation target for programmatic moves —
  // see file-level comment for why this is deliberately one shared value,
  // not two. Updated from real onScroll events during any touch/momentum,
  // and by withTiming for step/commit/external-sync moves.
  const scrollY = useSharedValue(selectedIndex * ITEM_HEIGHT);
  // Eagerly tracks "what this column's own actions have already committed
  // to" — read/written synchronously by step()/commitOffset() rather than
  // waiting on the `selectedValue` prop to round-trip through the parent's
  // re-render. Spamming the step buttons faster than that round-trip used
  // to compute every press from the same stale prop value (visually
  // "stuck" after the first press); this ref is always current the instant
  // this component itself changes the value.
  const selfCommittedValue = useRef(selectedValue);
  // True for the duration of a programmatic (step/commit/external-sync)
  // scroll animation. The reaction below commands real native scrollTo
  // calls every frame to actually move the ScrollView, and each of those
  // fires a genuine onScroll event back — if that event's handler also
  // wrote its (slightly-lagged, bridge-roundtrip) value into `scrollY`,
  // it would fight the withTiming animation currently driving that same
  // value on the UI thread. iOS apparently doesn't tolerate that fight
  // well: after a few presses in a row the animation would corrupt/stall
  // and the picker would stop responding for a couple of seconds. Gating
  // handleScroll with this flag means onScroll only ever updates `scrollY`
  // during a *real* touch/momentum (untouched, still exactly what makes
  // Android's drag and highlight-sync work) — during our own animation,
  // `scrollY` is left entirely to withTiming.
  const isProgrammaticAnimating = useRef(false);

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (isTouchingSV.value) return; // never fight a live touch
      scrollTo(scrollRef, 0, y, false);
    }
  );

  function endProgrammaticAnimation() {
    isProgrammaticAnimating.current = false;
  }

  function scrollToIndex(index: number, animated: boolean, duration: number = EXTERNAL_SYNC_DURATION) {
    const y = index * ITEM_HEIGHT;
    if (!animated) {
      scrollY.value = y;
      return;
    }
    isProgrammaticAnimating.current = true;
    scrollY.value = withTiming(y, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
      // Only clear on a real finish, not a cancellation — a rapid second
      // press reassigning scrollY interrupts this callback with
      // finished=false, and the flag must stay set until whichever
      // animation is actually still running completes for real.
      if (finished) runOnJS(endProgrammaticAnimation)();
    });
  }

  // Keep the wheel's scroll position in sync when `selectedValue` changes
  // from outside this column (e.g. opening the modal in edit mode, or the
  // parent resetting both time fields at once) without fighting the user's
  // own drag and without redundantly re-animating a change this column's
  // own step()/commitOffset() already drove directly.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return; // initial position is already correct via contentOffset/the shared values' init
    }
    if (isTouching.current) return;
    if (selfCommittedValue.current === selectedValue) return;
    selfCommittedValue.current = selectedValue;
    scrollToIndex(selectedIndex, !reduceMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  function indexFromOffset(offsetY: number): number {
    return Math.min(values.length - 1, Math.max(0, Math.round(offsetY / ITEM_HEIGHT)));
  }

  /** Only ever called once the touch has unambiguously ended (onMomentumScrollEnd) — safe to nudge the offset to a perfect snap and commit the value. */
  function commitOffset(offsetY: number) {
    const index = indexFromOffset(offsetY);
    const nextValue = values[index];
    if (nextValue !== selfCommittedValue.current) {
      selfCommittedValue.current = nextValue;
      onChange(nextValue);
    }
    scrollToIndex(index, !reduceMotion, COMMIT_DURATION);
  }

  // Defensive fallback for the (rare, platform-dependent) case where a drag
  // ends without ever entering a momentum/snap phase — e.g. a released
  // finger with essentially zero movement. Never commands a scroll; it only
  // ever clears the `isTouching` ref so the wheel can't get permanently
  // stuck ignoring external value syncs. Cancelled the moment real momentum
  // starts, since onMomentumScrollEnd then owns clearing it (and committing).
  const noMomentumFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearFallback() {
    if (noMomentumFallback.current) {
      clearTimeout(noMomentumFallback.current);
      noMomentumFallback.current = null;
    }
  }

  function handleScrollBeginDrag() {
    clearFallback();
    isTouching.current = true;
    isTouchingSV.value = true;
  }

  function handleScrollEndDrag() {
    clearFallback();
    noMomentumFallback.current = setTimeout(() => {
      isTouching.current = false;
      isTouchingSV.value = false;
    }, 250);
  }

  function handleMomentumBegin() {
    clearFallback();
  }

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    clearFallback();
    isTouching.current = false;
    isTouchingSV.value = false;
    commitOffset(e.nativeEvent.contentOffset.y);
  }

  useEffect(() => clearFallback, []);

  // The only per-scroll-tick work: write the offset into the shared value
  // each WheelItem's useAnimatedStyle reads. No setState, so no React
  // re-render — this is what keeps it cheap regardless of row count. Skipped
  // while our own programmatic animation is driving `scrollY` directly (see
  // isProgrammaticAnimating) so the two never fight over the same value.
  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isProgrammaticAnimating.current) return;
    scrollY.value = e.nativeEvent.contentOffset.y;
  }

  // Self-contained: computes off this column's own eagerly-updated ref (not
  // the possibly-stale `selectedValue` prop), commits it immediately, and
  // drives the scroll animation directly rather than waiting for the
  // parent's re-render to come back around and trigger the sync effect
  // above — that round trip is exactly what made rapid presses feel like
  // they were queuing up instead of responding immediately.
  function step(delta: number) {
    if (disabled) return;
    const currentIndex = values.indexOf(selfCommittedValue.current);
    const nextIndex = Math.min(values.length - 1, Math.max(0, currentIndex + delta));
    const nextValue = values[nextIndex];
    if (nextValue === selfCommittedValue.current) return;
    selfCommittedValue.current = nextValue;
    scrollToIndex(nextIndex, !reduceMotion, STEP_DURATION);
    onChange(nextValue);
  }

  return (
    <View style={styles.column}>
      {/* Direction flipped from the original build: the top button now steps
          down and the bottom button steps up, to match a natural scroll
          feel rather than a spinner's "up = higher" convention. */}
      <TouchableOpacity
        onPress={() => step(-1)}
        disabled={disabled}
        style={[styles.stepBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-up" size={20} color={disabled ? colors.border : colors.text} />
      </TouchableOpacity>

      <View
        style={[styles.wheelWrap, { height: ITEM_HEIGHT * VISIBLE_ITEMS }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: values[0], max: values[values.length - 1], now: selectedValue, text: formatLabel(selectedValue) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        <View pointerEvents="none" style={[styles.selectionHighlight, { top: PADDING_COUNT * ITEM_HEIGHT, borderColor: colors.primary, backgroundColor: colors.primary + "14" }]} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!disabled}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: PADDING_COUNT * ITEM_HEIGHT }}
          contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumBegin}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {values.map((item, index) => (
            <WheelItem key={item} item={item} index={index} scrollY={scrollY} formatLabel={formatLabel} colors={colors} />
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity
        onPress={() => step(1)}
        disabled={disabled}
        style={[styles.stepBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-down" size={20} color={disabled ? colors.border : colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

type Props = {
  value: NormalizedTime;
  onChange: (next: NormalizedTime) => void;
  colors: ColorTokens;
  disabled?: boolean;
  /** Defaults to true — Hobbily displays times as 12h AM/PM elsewhere (Home, Planner rows); this keeps the picker consistent with that while still normalizing to 24h internally before onChange fires. */
  use12Hour?: boolean;
};

export default function TimeWheelPicker({ value, onChange, colors, disabled, use12Hour = true }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
  }, []);

  const safeValue: NormalizedTime = isValidHour(value?.hour) && isValidMinute(value?.minute) ? value : { hour: 0, minute: 0 };
  const isPM = safeValue.hour >= 12;

  const displayHour = useMemo(() => {
    if (!use12Hour) return safeValue.hour;
    const h = safeValue.hour % 12;
    return h === 0 ? 12 : h;
  }, [safeValue.hour, use12Hour]);

  const commit = useCallback(
    (nextDisplayHour: number, nextMinute: number, nextIsPM: boolean) => {
      let hour = nextDisplayHour;
      if (use12Hour) {
        hour = nextDisplayHour % 12;
        if (nextIsPM) hour += 12;
      }
      onChange({ hour, minute: nextMinute });
    },
    [onChange, use12Hour]
  );

  return (
    <View style={styles.row}>
      <WheelColumn
        values={use12Hour ? HOURS_12 : HOURS_24}
        selectedValue={displayHour}
        formatLabel={(v) => (use12Hour ? String(v) : pad2(v))}
        onChange={(v) => commit(v, safeValue.minute, isPM)}
        colors={colors}
        accessibilityLabel="Hour"
        disabled={disabled}
        reduceMotion={reduceMotion}
      />
      <Text style={[styles.separator, { color: colors.text }]}>:</Text>
      <WheelColumn
        values={MINUTES}
        selectedValue={safeValue.minute}
        formatLabel={pad2}
        onChange={(v) => commit(displayHour, v, isPM)}
        colors={colors}
        accessibilityLabel="Minute"
        disabled={disabled}
        reduceMotion={reduceMotion}
      />
      {use12Hour && (
        <View style={styles.periodGroup} accessibilityRole="radiogroup" accessibilityLabel="AM or PM">
          {(["AM", "PM"] as const).map((label, i) => {
            const active = isPM === (i === 1);
            return (
              <TouchableOpacity
                key={label}
                onPress={() => commit(displayHour, safeValue.minute, i === 1)}
                disabled={disabled}
                style={[
                  styles.periodBtn,
                  {
                    backgroundColor: active ? colors.primary : colors.inputBackground,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={label}
              >
                <Text style={{ color: active ? "#fff" : colors.secondaryText, fontWeight: "700", fontSize: 13 }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  column: { alignItems: "center" },
  stepBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  wheelWrap: { width: 64, position: "relative", overflow: "hidden" },
  selectionHighlight: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  wheelItem: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelItemText: { fontSize: 19 },
  separator: { fontSize: 22, fontWeight: "800", marginHorizontal: 2 },
  periodGroup: { marginLeft: 10, gap: 6 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
});
