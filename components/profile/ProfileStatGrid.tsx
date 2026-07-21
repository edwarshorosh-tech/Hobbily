/**
 * ProfileStatGrid — the 2-column real-stats grid used on both UserCardSheet
 * (compact preview) and the Public Profile screen. Every cell is real,
 * backend-backed data (see hooks/useProfileActivityStats.ts) — a null value
 * renders a subtle "…" rather than a fake 0, so a still-loading count is
 * never confused with a genuine zero.
 */
import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";

export type StatCell = {
  key: string;
  icon: string; // Ionicons name
  label: string;
  value: number | null;
};

export default function ProfileStatGrid({ cells, colors }: { cells: StatCell[]; colors: ColorTokens }) {
  return (
    <View style={styles.grid}>
      {cells.map((cell) => (
        <View key={cell.key} style={[styles.cell, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={cell.icon as any} size={16} color={colors.primary} />
          <Text style={[styles.value, { color: colors.text }]}>{cell.value === null ? "…" : cell.value}</Text>
          <Text style={[styles.label, { color: colors.secondaryText }]} numberOfLines={1}>{cell.label}</Text>
        </View>
      ))}
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
  value: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "600" },
});
