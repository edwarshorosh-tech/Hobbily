/**
 * DurationSlider — the one control for picking a practice/task duration,
 * replacing the old combination of a free-text minutes field AND a row of
 * preset buttons (two controls fighting over the same value). Built on
 * @react-native-community/slider — the official, actively maintained,
 * genuinely cross-platform (iOS/Android/web) RN slider; on web it renders a
 * native <input type="range">, which is keyboard-, mouse-, and
 * screen-reader-accessible for free. No competing text input or button row
 * is rendered alongside it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { ColorTokens } from "../../context/ThemeContext";
import { SLIDER_MAX_MINUTES, SLIDER_MIN_MINUTES, SLIDER_STEP_MINUTES, formatDuration } from "../../utils/duration";

const SCALE_LABELS = [5, 30, 60, 120, 240];

type Props = {
  /** Committed value (only reflected back into parent state on release — see onChange). */
  value: number;
  /** Fires once the user finishes dragging/stepping — never on every intermediate frame, so callers never write to storage mid-drag. */
  onChange: (minutes: number) => void;
  colors: ColorTokens;
  disabled?: boolean;
};

export default function DurationSlider({ value, onChange, colors, disabled }: Props) {
  // Local state drives the live label while dragging so the UI feels
  // immediate; `value` (the committed prop) only updates on release, which
  // is also the only time onChange fires.
  const [liveValue, setLiveValue] = useState(value);

  // The native slider can call onValueChange far more often than the screen
  // actually repaints (it used to flow straight into setState — a fresh
  // React render, and a fresh object identity for the Slider's own
  // accessibilityValue prop, on every single tick, which is what made
  // dragging feel laggy). Coalescing into at most one state update per
  // animation frame keeps the label smooth without re-rendering more than
  // the display can show.
  const pendingValue = useRef(value);
  const frameHandle = useRef<number | null>(null);
  const handleValueChange = useCallback((next: number) => {
    pendingValue.current = next;
    if (frameHandle.current !== null) return;
    frameHandle.current = requestAnimationFrame(() => {
      frameHandle.current = null;
      setLiveValue(pendingValue.current);
    });
  }, []);

  useEffect(
    () => () => {
      if (frameHandle.current !== null) cancelAnimationFrame(frameHandle.current);
    },
    []
  );

  // The modal reuses this component across opens (add mode <-> editing a
  // different task) without remounting it — resync the live label whenever
  // the committed value changes from outside a drag.
  useEffect(() => setLiveValue(value), [value]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>Duration</Text>
        <Text style={[styles.valueText, { color: colors.primary }]}>{formatDuration(liveValue)}</Text>
      </View>

      <Slider
        value={value}
        minimumValue={SLIDER_MIN_MINUTES}
        maximumValue={SLIDER_MAX_MINUTES}
        step={SLIDER_STEP_MINUTES}
        disabled={disabled}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.primary}
        onValueChange={handleValueChange}
        onSlidingComplete={onChange}
        accessibilityLabel="Duration in minutes"
        // Bound to the committed `value`, not the live drag value — this is
        // what a screen reader announces on focus, and (unlike the live
        // label above) has no reason to recompute on every drag tick, which
        // previously forced a native prop update every tick regardless of
        // whether the slider's actual position had changed.
        accessibilityValue={{ min: SLIDER_MIN_MINUTES, max: SLIDER_MAX_MINUTES, now: value, text: formatDuration(value) }}
        style={styles.slider}
      />

      <View style={styles.scaleRow}>
        {SCALE_LABELS.map((m) => (
          <Text key={m} style={[styles.scaleLabel, { color: colors.secondaryText }]}>
            {m < 60 ? `${m}m` : `${m / 60}h`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 },
  label: { fontSize: 13, fontWeight: "600" },
  valueText: { fontSize: 15, fontWeight: "800" },
  slider: { width: "100%", height: 36 },
  scaleRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
  scaleLabel: { fontSize: 10, fontWeight: "600" },
});
