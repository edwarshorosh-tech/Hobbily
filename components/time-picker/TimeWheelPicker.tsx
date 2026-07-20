/**
 * TimeWheelPicker — the app's one structured time input, replacing the old
 * freeform "HH:MM" text field that let Planner save impossible times like
 * "12:66" or "90:0" (and, when the user stopped typing after 1-2 digits,
 * incomplete values like "9" that later crashed Home's formatTime). Every
 * value this component can produce is already a valid NormalizedTime — there
 * is no code path back to a free-text string until formatTimeString() is
 * called on a value that has already passed through here.
 *
 * Built on RN core (ScrollView + Animated) rather than a new native-module
 * dependency: no wheel-picker library in this project is both Expo-Go-safe
 * and genuinely cross-platform (react-native-community/datetimepicker has no
 * web support; react-native-picker/picker needs a custom dev client). Each
 * wheel is a plain ScrollView, not a FlatList/VirtualizedList — deliberately:
 * a wheel only ever holds at most 60 items (minutes), so virtualization buys
 * nothing, and this component is used inside the Add/Edit Activity sheet's
 * own scrollable form, where a nested VirtualizedList of the same
 * (vertical) orientation would break RN's windowing (and log a "should
 * never be nested inside plain ScrollViews" error) — a plain ScrollView
 * nests safely. It still gets native momentum scrolling, mouse-wheel
 * scrolling on web, and full touch support for free; explicit +/- buttons
 * and accessibilityActions cover keyboard and screen-reader use on top.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { NormalizedTime, isValidHour, isValidMinute } from "../../utils/time";

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PADDING_COUNT = Math.floor(VISIBLE_ITEMS / 2);
const SETTLE_DELAY_MS = 120;

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
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserDriven = useRef(false);
  const hasMounted = useRef(false);
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));

  function scrollToIndex(index: number, animated: boolean) {
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
  }

  // Keep the wheel's scroll position in sync when `selectedValue` changes
  // from outside (e.g. opening the modal in edit mode, or the +/- buttons/
  // accessibility actions below) without fighting the user's own drag.
  // Jumps instantly on first mount (there's nothing to animate from yet).
  useEffect(() => {
    if (isUserDriven.current) return;
    scrollToIndex(selectedIndex, hasMounted.current && !reduceMotion);
    hasMounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  function commitOffset(offsetY: number) {
    const index = Math.min(values.length - 1, Math.max(0, Math.round(offsetY / ITEM_HEIGHT)));
    const nextValue = values[index];
    if (nextValue !== selectedValue) onChange(nextValue);
    scrollToIndex(index, !reduceMotion);
  }

  function scheduleSettle(offsetY: number) {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      isUserDriven.current = false;
      commitOffset(offsetY);
    }, SETTLE_DELAY_MS);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    isUserDriven.current = true;
    scheduleSettle(e.nativeEvent.contentOffset.y);
  }

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    isUserDriven.current = false;
    commitOffset(e.nativeEvent.contentOffset.y);
  }

  function step(delta: number) {
    if (disabled) return;
    const currentIndex = values.indexOf(selectedValue);
    const nextIndex = Math.min(values.length - 1, Math.max(0, currentIndex + delta));
    if (values[nextIndex] !== selectedValue) onChange(values[nextIndex]);
  }

  return (
    <View style={styles.column}>
      <TouchableOpacity
        onPress={() => step(1)}
        disabled={disabled}
        style={styles.stepBtn}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityLabel}`}
        hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-up" size={16} color={disabled ? colors.border : colors.secondaryText} />
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
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollEndDrag={(e) => scheduleSettle(e.nativeEvent.contentOffset.y)}
        >
          {values.map((item) => {
            const isSelected = item === selectedValue;
            return (
              <View key={item} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelItemText,
                    { color: isSelected ? colors.primary : colors.secondaryText, fontWeight: isSelected ? "800" : "500" },
                  ]}
                >
                  {formatLabel(item)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <TouchableOpacity
        onPress={() => step(-1)}
        disabled={disabled}
        style={styles.stepBtn}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityLabel}`}
        hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
      >
        <Ionicons name="chevron-down" size={16} color={disabled ? colors.border : colors.secondaryText} />
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
  stepBtn: { paddingVertical: 4, paddingHorizontal: 10 },
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
