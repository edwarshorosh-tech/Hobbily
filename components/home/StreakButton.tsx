/**
 * StreakButton — shared compact streak control (fire icon + current streak
 * number). Used in the Home header and the Profile header so both read the
 * same ProgressContext value and open the same StreakInfoModal — no second
 * streak calculation, no divergent UI. Pulses briefly via
 * useStreakUpdateAnimation whenever `streak` actually changes (never on
 * initial load or an unrelated re-render) — pass `isLoaded` from
 * useProgress() so that distinction can be made correctly.
 */
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { ColorTokens } from "../../context/ThemeContext";
import { brand } from "../../constants/colors";
import { useStreakUpdateAnimation } from "../../hooks/useStreakUpdateAnimation";

type Props = {
  streak: number;
  /** From useProgress()'s own isLoaded — lets the animation tell "first real value" apart from "an actual change". Defaults true so existing callers that haven't been updated yet still animate correctly after their own first render. */
  isLoaded?: boolean;
  colors: ColorTokens;
  onPress: () => void;
};

export default function StreakButton({ streak, isLoaded = true, colors, onPress }: Props) {
  const value = Math.max(0, streak || 0);
  const { scaleStyle, iconStyle, glowStyle } = useStreakUpdateAnimation(value, isLoaded);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Current streak: ${value} day${value === 1 ? "" : "s"}. View streak details.`}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: brand.streakFlame }, glowStyle]} />
      <Animated.View style={[styles.inner, scaleStyle]}>
        <Animated.View style={iconStyle}>
          <Ionicons name="flame" size={16} color={brand.streakFlame} />
        </Animated.View>
        <Text style={[styles.text, { color: colors.text }]}>{value}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  glow: { ...StyleSheet.absoluteFillObject, borderRadius: 22 },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  text: { fontSize: 15, fontWeight: "800" },
});
