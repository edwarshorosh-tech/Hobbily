/**
 * ProfileStatGrid — the 2-column real-stats grid used on UserCardSheet
 * (compact preview), the Public Profile screen, and the own Profile screen.
 * Every cell is real, backend-backed data (see hooks/useProfileActivityStats.ts)
 * — a null value renders a subtle "…" rather than a fake 0, so a still-loading
 * count is never confused with a genuine zero. A cell with `onPress` (e.g.
 * Communities/Workshops, which open app/profile-activity/[uid].tsx) renders
 * as a real button with a pressed state and a chevron hint; cells without one
 * (Hobbies, streak) stay plain, non-interactive display.
 */
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";

export type StatCell = {
  key: string;
  icon: string; // Ionicons name
  label: string;
  value: number | null;
  onPress?: () => void;
};

export default function ProfileStatGrid({ cells, colors }: { cells: StatCell[]; colors: ColorTokens }) {
  return (
    <View style={styles.grid}>
      {cells.map((cell) => {
        const content = (
          <>
            <View style={styles.iconRow}>
              <Ionicons name={cell.icon as any} size={16} color={colors.primary} />
              {cell.onPress && <Ionicons name="chevron-forward" size={13} color={colors.secondaryText} />}
            </View>
            <Text style={[styles.value, { color: colors.text }]}>{cell.value === null ? "…" : cell.value}</Text>
            <Text style={[styles.label, { color: colors.secondaryText }]} numberOfLines={1}>{cell.label}</Text>
          </>
        );
        return cell.onPress ? (
          <TouchableOpacity
            key={cell.key}
            onPress={cell.onPress}
            disabled={cell.value === null}
            style={[styles.cell, { backgroundColor: colors.card, borderColor: colors.border, opacity: cell.value === null ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${cell.value ?? 0} ${cell.label}. View list.`}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={cell.key} style={[styles.cell, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 3,
  },
  iconRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  value: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "600" },
});
