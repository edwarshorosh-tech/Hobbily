/**
 * AchievementDetailSheet — the shared bottom sheet opened by tapping any
 * achievement badge (own Profile Badges grid, a featured-achievement icon on
 * UserCardSheet). Uses the same BottomSheet shell as every other sheet in
 * the app rather than a bespoke modal.
 */
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { Achievement } from "../../types/Progress";
import { achievementDefById } from "../../constants/achievements";
import BottomSheet from "../BottomSheet";

type Props = {
  /** Achievement id to show, or null to keep the sheet closed. */
  achievementId: string | null;
  onClose: () => void;
  colors: ColorTokens;
  /** This viewer's own unlocked achievements — used to compute progress/unlocked state. */
  unlockedAchievements: Achievement[];
  currentStats: { totalSessions: number; totalMinutes: number; currentStreak: number };
};

export default function AchievementDetailSheet({ achievementId, onClose, colors, unlockedAchievements, currentStats }: Props) {
  const visible = achievementId !== null;
  // Keeps showing the last real id's content through the close animation —
  // achievementId going null would otherwise blank this sheet's content
  // instantly (achievementDefById is a synchronous lookup, not async state,
  // but the effect is the same visual bug as UserCardSheet's).
  const lastIdRef = useRef<string | null>(null);
  // Callers (UserCardSheet, Public Profile) recompute unlockedAchievements/
  // currentStats from their own achievementId-keyed state too, so those
  // props go stale/empty on the very same close the id does — freezing
  // them here as well, not just the id, is what actually keeps the whole
  // sheet's content stable through the close animation.
  const lastUnlockedRef = useRef<Achievement[]>([]);
  const lastStatsRef = useRef(currentStats);
  if (achievementId) {
    lastIdRef.current = achievementId;
    lastUnlockedRef.current = unlockedAchievements;
    lastStatsRef.current = currentStats;
  }
  const effectiveId = achievementId ?? lastIdRef.current;
  const effectiveUnlocked = achievementId ? unlockedAchievements : lastUnlockedRef.current;
  const effectiveStats = achievementId ? currentStats : lastStatsRef.current;
  const def = effectiveId ? achievementDefById(effectiveId) : undefined;
  const unlocked = def ? effectiveUnlocked.find((a) => a.id === def.id) : undefined;

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="70%">
      {def ? (
        <View style={styles.content}>
          <View
            style={[
              styles.iconCircle,
              unlocked
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
            ]}
          >
            <Ionicons name={def.icon as any} size={36} color={unlocked ? "#fff" : colors.secondaryText} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{def.title}</Text>
          <Text style={[styles.description, { color: colors.secondaryText }]}>{def.description}</Text>

          {unlocked ? (
            <View style={[styles.statusBadge, { backgroundColor: `${colors.primary}14` }]}>
              <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.primary }]}>{unlocked.earnedAt ? `Unlocked ${unlocked.earnedAt}` : "Unlocked"}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.statusBadge, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.secondaryText} />
                <Text style={[styles.statusText, { color: colors.secondaryText }]}>Not earned yet</Text>
              </View>
              {(() => {
                const progress = def.progress({
                  streakDays: [],
                  totalSessions: effectiveStats.totalSessions,
                  totalMinutes: effectiveStats.totalMinutes,
                  longestStreak: 0,
                  achievements: effectiveUnlocked,
                  streakFreezeAvailable: false,
                  streakFreezeLastGranted: "",
                  currentStreak: effectiveStats.currentStreak,
                });
                const pct = progress.target > 0 ? Math.min(1, progress.current / progress.target) : 0;
                return (
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${pct * 100}%` }]} />
                    </View>
                    <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>
                      {progress.current} / {progress.target}
                    </Text>
                  </View>
                );
              })()}
            </>
          )}

          <View style={[styles.howToCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.howToLabel, { color: colors.secondaryText }]}>How to earn this</Text>
            <Text style={[styles.howToText, { color: colors.text }]}>{def.howToEarn}</Text>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingBottom: 16, paddingTop: 4 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", marginTop: 4, marginBottom: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  progressWrap: { width: "100%", marginTop: 14, gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", width: "100%" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 12, textAlign: "center", fontWeight: "600" },
  howToCard: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 18, gap: 4 },
  howToLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  howToText: { fontSize: 13, lineHeight: 19 },
});
