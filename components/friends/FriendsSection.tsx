/**
 * FriendsSection — the compact "Friends" card on the Profile Overview tab.
 * Shows the accepted-friend count, a plus button (badged when requests are
 * pending) that opens FriendSearchModal, a horizontally scrollable accepted
 * friend list, and a friendly empty state. Tapping a friend opens the
 * reusable UserCardSheet (also used from community chat, the leaderboard,
 * posts, and comments) — "Remove Friend" lives there now.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useFriends } from "../../context/FriendsContext";
import SectionCardHeader from "../profile/SectionCardHeader";
import FriendAvatar from "./FriendAvatar";
import { brand } from "../../constants/colors";
import FriendSearchModal from "./FriendSearchModal";
import UserCardSheet from "../user-card/UserCardSheet";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";

type Props = {
  colors: ColorTokens;
  /** When true, opens the search modal straight to the Requests pane (used for the friend-request notification deep link) — consumed once via onAutoOpenHandled. */
  autoOpenRequests?: boolean;
  onAutoOpenHandled?: () => void;
};

export default function FriendsSection({ colors, autoOpenRequests, onAutoOpenHandled }: Props) {
  const { acceptedFriends, incomingRequests, isLoaded, loadError } = useFriends();
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchModalInitialTab, setSearchModalInitialTab] = useState<"find" | "requests">("find");
  const { selectedUid: previewUid, openUserProfile: setPreviewUid, closeUserProfile: closePreview } = useUserProfileSheet();

  useEffect(() => {
    if (!autoOpenRequests) return;
    setSearchModalInitialTab("requests");
    setSearchModalVisible(true);
    onAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenRequests]);

  const hasRequests = incomingRequests.length > 0;

  function openSearchModal() {
    setSearchModalInitialTab("find");
    setSearchModalVisible(true);
  }

  return (
    <View style={styles.section}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SectionCardHeader
          icon="people-outline"
          title="Friends"
          count={acceptedFriends.length}
          colors={colors}
          action={
            <TouchableOpacity
              onPress={openSearchModal}
              style={[styles.addBtn, { borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Add a friend"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Friend</Text>
              {hasRequests && (
                <View style={[styles.badge, { backgroundColor: "#EF4444", borderColor: colors.card }]}>
                  <Text style={styles.badgeText}>{incomingRequests.length > 9 ? "9+" : incomingRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          }
        />

        {!isLoaded ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.secondaryText} />
          </View>
        ) : loadError ? (
          <View style={styles.stateRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.secondaryText} />
            <Text style={[styles.stateText, { color: colors.secondaryText }]}>{loadError}</Text>
          </View>
        ) : acceptedFriends.length === 0 ? (
          // Single control for this whole card: the "Add Friend" button in
          // the header above. This empty state used to repeat a second,
          // icon-only "Add Friend" button here — two controls for the same
          // action — so it's description-only now.
          <View style={styles.emptyState}>
            <View style={styles.emptyRow}>
              <Ionicons name="people-outline" size={20} color={colors.secondaryText} />
              <View style={styles.emptyTextCol}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No friends yet</Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  Add friends to compare progress and discover shared hobbies.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendRow}
          >
            {acceptedFriends.map((friend) => {
              const streak = Math.max(0, friend.currentStreak || 0);
              return (
                <TouchableOpacity
                  key={friend.uid}
                  style={styles.friendItem}
                  onPress={() => setPreviewUid(friend.uid)}
                  accessibilityRole="button"
                  accessibilityLabel={`${friend.username || "User"}, ${streak} day streak`}
                >
                  <FriendAvatar username={friend.username} avatarUrl={friend.avatarUrl} size={48} colors={colors} />
                  <Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>
                    {friend.username || "User"}
                  </Text>
                  {streak > 0 ? (
                    <View style={styles.streakRow}>
                      <Ionicons name="flame" size={11} color={brand.streakFlame} />
                      <Text style={[styles.streakText, { color: colors.secondaryText }]}>{streak}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <FriendSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        colors={colors}
        initialTab={searchModalInitialTab}
      />
      <UserCardSheet uid={previewUid} colors={colors} onClose={closePreview} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {},
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: { fontSize: 13, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  loadingRow: { paddingVertical: 10, alignItems: "center" },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  stateText: { fontSize: 13, flex: 1 },
  emptyState: { gap: 10 },
  emptyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  emptyTextCol: { flex: 1, minWidth: 0, gap: 2 },
  emptyTitle: { fontSize: 14, fontWeight: "700" },
  emptyBody: { fontSize: 12, lineHeight: 16 },
  friendRow: { gap: 14, paddingVertical: 2 },
  friendItem: { alignItems: "center", width: 60, gap: 4 },
  friendName: { fontSize: 12, fontWeight: "600", maxWidth: 60 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  streakText: { fontSize: 11, fontWeight: "600" },
});
