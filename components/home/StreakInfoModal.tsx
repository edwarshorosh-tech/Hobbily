/**
 * StreakInfoModal — opened by the shared StreakButton (Home header, Profile
 * header). Now a bottom sheet built on the same shared BottomSheet shell as
 * NotificationCenter (backdrop fade, slide-up, handle, safe-area, Android
 * back) instead of a centered modal, so both feel like one consistent
 * interaction system. Reads only from ProgressContext (currentStreak/
 * longestStreak/recentActivity/isLoaded/loadError) — no second streak
 * calculation. Describes the streak using its actual definition
 * (computeCurrentStreak in ProgressContext.tsx: consecutive local calendar
 * days with at least one completed session) — never "days the app was opened."
 */
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useProgress } from "../../context/ProgressContext";
import BottomSheet from "../BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
};

function streakCopy(currentStreak: number, longestStreak: number): { headline: string; sub: string } {
  if (currentStreak === 0) {
    return { headline: "No active streak", sub: "Complete an activity today to start your streak." };
  }
  if (longestStreak > 0 && currentStreak === longestStreak) {
    return { headline: "New personal best!", sub: "This is your best streak yet." };
  }
  return {
    headline: `${currentStreak}-day streak`,
    sub: `You've stayed consistent for ${currentStreak} day${currentStreak === 1 ? "" : "s"}.`,
  };
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export default function StreakInfoModal({ visible, onClose, colors }: Props) {
  const { currentStreak, longestStreak, recentActivity, isLoaded, loadError } = useProgress();

  const { headline, sub } = streakCopy(currentStreak, longestStreak);
  const showBest = longestStreak > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="80%">
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Your Streak</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {!isLoaded ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.secondaryText} />
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.secondaryText} />
          <Text style={[styles.subText, { color: colors.secondaryText, textAlign: "center" }]}>{loadError}</Text>
        </View>
      ) : (
        <>
          <View style={styles.headlineRow}>
            <Ionicons name="flame" size={28} color="#F59E0B" />
            <Text style={[styles.headline, { color: colors.text }]}>{headline}</Text>
          </View>
          <Text style={[styles.subText, { color: colors.secondaryText }]}>{sub}</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>{currentStreak}</Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Current</Text>
            </View>
            <View style={[styles.statBox, { borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>{showBest ? longestStreak : "—"}</Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Best</Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>Last 7 days</Text>
          <View style={styles.daysRow}>
            {recentActivity.map((d, i) => (
              <View key={d.date} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayDot,
                    {
                      backgroundColor: d.active ? colors.primary : colors.background,
                      borderColor: d.active ? colors.primary : colors.border,
                    },
                  ]}
                  accessibilityLabel={`${d.date}${d.active ? ", activity completed" : ", no activity"}`}
                >
                  {d.active && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={[styles.dayLetter, { color: colors.secondaryText }]}>{DAY_LETTERS[i]}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.hintRow, { borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={15} color={colors.secondaryText} />
            <Text style={[styles.hintText, { color: colors.secondaryText }]}>
              Complete at least one activity each day to keep your streak going.
            </Text>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 6 },
  title: { fontSize: 19, fontWeight: "800" },
  closeBtn: { padding: 2 },
  centerState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  headline: { fontSize: 19, fontWeight: "800" },
  subText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  statBox: { flex: 1, alignItems: "center", borderWidth: 1, borderRadius: 12, paddingVertical: 12, gap: 2 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 18, marginBottom: 8 },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCol: { alignItems: "center", gap: 4, width: 32 },
  dayDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dayLetter: { fontSize: 10, fontWeight: "600" },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 18, paddingTop: 14, paddingBottom: 4, borderTopWidth: 1 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 16 },
});
