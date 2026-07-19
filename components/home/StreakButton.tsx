/**
 * StreakButton — shared compact streak control (fire icon + current streak
 * number). Used in the Home header and the Profile header so both read the
 * same ProgressContext value and open the same StreakInfoModal — no second
 * streak calculation, no divergent UI.
 */
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";

type Props = {
  streak: number;
  colors: ColorTokens;
  onPress: () => void;
};

export default function StreakButton({ streak, colors, onPress }: Props) {
  const value = Math.max(0, streak || 0);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Current streak: ${value} day${value === 1 ? "" : "s"}. View streak details.`}
    >
      <Ionicons name="flame" size={16} color="#F59E0B" />
      <Text style={[styles.text, { color: colors.text }]}>{value}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
  },
  text: { fontSize: 15, fontWeight: "800" },
});
