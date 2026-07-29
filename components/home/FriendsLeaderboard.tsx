/**
 * FriendsLeaderboard — "Friends Leaderboard" section on Home, immediately after
 * Quick Actions. Compares the current user's streak (from ProgressContext —
 * the app's one and only streak calculation) against accepted friends'
 * mirrored currentStreak (from FriendsContext / publicProfiles). Ranking is
 * memoized outside JSX; friend profiles refresh on screen focus.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { ColorTokens } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";
import { brand } from "../../constants/colors";
import { useProgress } from "../../context/ProgressContext";
import { useStreakUpdateAnimation } from "../../hooks/useStreakUpdateAnimation";
import { useFriends } from "../../context/FriendsContext";
import FriendAvatar from "../friends/FriendAvatar";
import UserCardSheet from "../user-card/UserCardSheet";
import FriendSearchModal from "../friends/FriendSearchModal";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";
import { useTourTarget } from "../../context/TourTargetsContext";
import { useLocalAvatar } from "../../context/LocalAvatarContext";
import { resolveAvatar } from "../../utils/resolveAvatar";

export type FriendLeaderboardEntry = {
  uid: string;
  username: string;
  avatarUrl: string | null;
  currentStreak: number;
  isCurrentUser: boolean;
  /** Dense rank by streak — tied streaks share the same rank. */
  rank: number;
};

function normalizeStreak(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.floor(n));
}

function buildLeaderboard(entries: Omit<FriendLeaderboardEntry, "rank">[]): FriendLeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    return a.username.localeCompare(b.username);
  });
  let rank = 0;
  let lastStreak: number | null = null;
  return sorted.map((e, i) => {
    if (lastStreak === null || e.currentStreak !== lastStreak) {
      rank = i + 1;
      lastStreak = e.currentStreak;
    }
    return { ...e, rank };
  });
}

function podiumHeight(entry: FriendLeaderboardEntry, allZero: boolean): number {
  if (allZero) return 60;
  if (entry.rank === 1) return 86;
  if (entry.rank === 2) return 70;
  return 58;
}

/** Only ever used for the current user's own streak — see its call sites below (a friend's streak never animates on this device; there's no realtime push for it, only a refresh-on-focus). */
function AnimatedStreakChip({ value, isLoaded, textColor }: { value: number; isLoaded: boolean; textColor: string }) {
  const { scaleStyle, iconStyle } = useStreakUpdateAnimation(value, isLoaded);
  return (
    <Animated.View style={[styles.podiumStreakRow, scaleStyle]}>
      <Animated.View style={iconStyle}>
        <Ionicons name="flame" size={12} color={brand.streakFlame} />
      </Animated.View>
      <Text style={[styles.podiumStreakText, { color: textColor }]}>{value}</Text>
    </Animated.View>
  );
}

/** Same pulse, no icon — for the "remaining" list row, which never showed a flame icon and shouldn't gain one just for the current user. */
function AnimatedStreakNumber({ value, isLoaded, textColor }: { value: number; isLoaded: boolean; textColor: string }) {
  const { scaleStyle } = useStreakUpdateAnimation(value, isLoaded);
  return (
    <Animated.Text style={[styles.remainingStreak, { color: textColor }, scaleStyle]}>{value}</Animated.Text>
  );
}

function PodiumSlot({
  entry,
  colors,
  allZero,
  progressIsLoaded,
  onPress,
}: {
  entry: FriendLeaderboardEntry;
  colors: ColorTokens;
  allZero: boolean;
  progressIsLoaded: boolean;
  onPress: () => void;
}) {
  const height = podiumHeight(entry, allZero);
  return (
    <TouchableOpacity
      style={styles.podiumSlot}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.isCurrentUser ? "Your" : entry.username + "'s"} profile, ${entry.currentStreak} day streak`}
    >
      <FriendAvatar
        username={entry.username}
        avatarUrl={entry.avatarUrl}
        size={entry.rank === 1 && !allZero ? 52 : 44}
        colors={colors}
        highlighted={entry.isCurrentUser}
      />
      <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
        {entry.isCurrentUser ? "You" : entry.username}
      </Text>
      {entry.isCurrentUser ? (
        <AnimatedStreakChip value={entry.currentStreak} isLoaded={progressIsLoaded} textColor={colors.secondaryText} />
      ) : (
        <View style={styles.podiumStreakRow}>
          <Ionicons name="flame" size={12} color={brand.streakFlame} />
          <Text style={[styles.podiumStreakText, { color: colors.secondaryText }]}>
            {entry.currentStreak}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.podiumBar,
          { height, backgroundColor: entry.isCurrentUser ? colors.primary : colors.secondary },
        ]}
      />
    </TouchableOpacity>
  );
}

export default function FriendsLeaderboard({ colors }: { colors: ColorTokens }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { currentStreak, isLoaded: progressIsLoaded } = useProgress();
  const { acceptedFriends, isLoaded, loadError, refreshFriendProfiles } = useFriends();
  const { selectedUid: cardUid, openUserProfile: setCardUid, closeUserProfile: closeCardUid } = useUserProfileSheet();
  const tourRef = useTourTarget("addFriends");
  const { localAvatarUri } = useLocalAvatar();
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshFriendProfiles();
    }, [refreshFriendProfiles])
  );

  const entries = useMemo<FriendLeaderboardEntry[]>(() => {
    if (!user) return [];
    const base: Omit<FriendLeaderboardEntry, "rank">[] = [
      {
        uid: user.uid,
        username: profile.username || "User",
        avatarUrl: resolveAvatar({ viewedUserId: user.uid, currentUserId: user.uid, localAvatarUri, serverAvatarUrl: profile.avatarUrl ?? null }),
        currentStreak: normalizeStreak(currentStreak),
        isCurrentUser: true,
      },
      ...acceptedFriends.map((f) => ({
        uid: f.uid,
        username: f.username || "User",
        avatarUrl: f.avatarUrl ?? null,
        currentStreak: normalizeStreak(f.currentStreak),
        isCurrentUser: false,
      })),
    ];
    return buildLeaderboard(base);
  }, [user, profile.username, profile.avatarUrl, localAvatarUri, currentStreak, acceptedFriends]);

  const hasFriends = entries.length > 1;
  const top3 = entries.slice(0, 3);
  const remaining = entries.slice(3);
  const allZero = entries.length > 0 && entries.every((e) => e.currentStreak === 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <View style={styles.titleRow}>
          <Ionicons name="flame-outline" size={16} color={colors.secondaryText} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Friends Leaderboard</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {!isLoaded ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.secondaryText} />
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.secondaryText} />
            <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>{loadError}</Text>
            <TouchableOpacity
              onPress={refreshFriendProfiles}
              style={[styles.retryBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading friend streaks"
            >
              <Text style={[styles.retryBtnText, { color: colors.text }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !hasFriends ? (
          <View style={styles.centerState}>
            <Ionicons name="people-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Add friends to compare streaks</Text>
            <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
              Your friends&apos; streaks will appear here.
            </Text>
            <TouchableOpacity
              ref={tourRef}
              onPress={() => setSearchModalVisible(true)}
              style={[styles.emptyAction, { borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Add a friend"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={[styles.emptyActionText, { color: colors.primary }]}>Add Friends</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {allZero && (
              <Text style={[styles.zeroHint, { color: colors.secondaryText }]}>
                Start a streak to take the lead.
              </Text>
            )}
            <View style={styles.podiumRow}>
              {top3[1] && <PodiumSlot entry={top3[1]} colors={colors} allZero={allZero} progressIsLoaded={progressIsLoaded} onPress={() => setCardUid(top3[1].uid)} />}
              {top3[0] && <PodiumSlot entry={top3[0]} colors={colors} allZero={allZero} progressIsLoaded={progressIsLoaded} onPress={() => setCardUid(top3[0].uid)} />}
              {top3[2] && <PodiumSlot entry={top3[2]} colors={colors} allZero={allZero} progressIsLoaded={progressIsLoaded} onPress={() => setCardUid(top3[2].uid)} />}
            </View>

            {remaining.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.remainingRow}
                style={{ marginTop: 14 }}
              >
                {remaining.map((entry) => (
                  <TouchableOpacity
                    key={entry.uid}
                    style={[styles.remainingItem, { borderColor: colors.border }]}
                    onPress={() => setCardUid(entry.uid)}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.isCurrentUser ? "Your" : entry.username + "'s"} profile, ${entry.currentStreak} day streak`}
                  >
                    <FriendAvatar
                      username={entry.username}
                      avatarUrl={entry.avatarUrl}
                      size={30}
                      colors={colors}
                      highlighted={entry.isCurrentUser}
                    />
                    <Text style={[styles.remainingName, { color: colors.text }]} numberOfLines={1}>
                      {entry.isCurrentUser ? "You" : entry.username}
                    </Text>
                    {entry.isCurrentUser ? (
                      <AnimatedStreakNumber value={entry.currentStreak} isLoaded={progressIsLoaded} textColor={colors.secondaryText} />
                    ) : (
                      <Text style={[styles.remainingStreak, { color: colors.secondaryText }]}>
                        {entry.currentStreak}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>

      <UserCardSheet uid={cardUid} colors={colors} onClose={closeCardUid} />
      <FriendSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        colors={colors}
        initialTab="find"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },

  centerState: { alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  emptyTitle: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  emptyBody: { fontSize: 12, textAlign: "center", lineHeight: 17, paddingHorizontal: 12 },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 4,
  },
  emptyActionText: { fontSize: 13, fontWeight: "700" },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginTop: 2 },
  retryBtnText: { fontSize: 13, fontWeight: "700" },

  zeroHint: { fontSize: 12, textAlign: "center", marginBottom: 10 },
  podiumRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 14 },
  podiumSlot: { alignItems: "center", width: 76, gap: 4 },
  podiumName: { fontSize: 12, fontWeight: "700", maxWidth: 76 },
  podiumStreakRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  podiumStreakText: { fontSize: 11, fontWeight: "600" },
  podiumBar: { width: "100%", borderRadius: 8, marginTop: 4 },

  remainingRow: { gap: 10 },
  remainingItem: {
    alignItems: "center",
    width: 58,
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  remainingName: { fontSize: 10, fontWeight: "600", maxWidth: 52 },
  remainingStreak: { fontSize: 10 },
});
