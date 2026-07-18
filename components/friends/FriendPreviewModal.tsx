/**
 * FriendPreviewModal — opened by tapping a friend avatar in FriendsSection.
 * Small profile summary + the "Remove Friend" action (kept off the main
 * compact Friends card per the design spec, confirmed via ConfirmModal).
 */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useFriends } from "../../context/FriendsContext";
import { PublicProfile } from "../../types/PublicProfile";
import { generateFriendshipPairId } from "../../services/friendsService";
import FriendAvatar from "./FriendAvatar";
import ConfirmModal from "../ConfirmModal";

type Props = {
  profile: PublicProfile | null;
  colors: ColorTokens;
  onClose: () => void;
};

export default function FriendPreviewModal({ profile, colors, onClose }: Props) {
  const { user } = useAuth();
  const { removeFriendship, actionState } = useFriends();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const friendshipId = user ? generateFriendshipPairId(user.uid, profile.uid) : null;
  const removing = friendshipId ? actionState[`remove:${friendshipId}`] === "loading" : false;
  const streak = Math.max(0, profile.currentStreak || 0);
  const displayName = profile.username || "User";

  async function handleRemove() {
    setConfirmVisible(false);
    if (!friendshipId) return;
    const result = await removeFriendship(friendshipId);
    if (result.ok) {
      setError(null);
      onClose();
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.secondaryText} />
            </TouchableOpacity>

            <FriendAvatar
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              size={64}
              colors={colors}
              style={styles.avatar}
            />
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {profile.city ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={13} color={colors.secondaryText} />
                <Text style={[styles.metaText, { color: colors.secondaryText }]}>{profile.city}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Ionicons name="flame" size={14} color="#F59E0B" />
              <Text style={[styles.metaText, { color: colors.secondaryText }]}>{streak} day streak</Text>
            </View>

            {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.removeBtn, { borderColor: colors.border, opacity: removing ? 0.6 : 1 }]}
              onPress={() => setConfirmVisible(true)}
              disabled={removing || !friendshipId}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${displayName} from friends`}
            >
              <Ionicons name="person-remove-outline" size={16} color={colors.text} />
              <Text style={[styles.removeBtnText, { color: colors.text }]}>
                {removing ? "Removing..." : "Remove Friend"}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={confirmVisible}
        title="Remove Friend?"
        message={`Remove ${displayName} from your friends?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        dangerous
        onConfirm={handleRemove}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 6,
  },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 4 },
  avatar: { marginBottom: 4 },
  name: { fontSize: 18, fontWeight: "800", maxWidth: 260 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13 },
  errorText: { fontSize: 12, marginTop: 4, textAlign: "center" },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 14,
  },
  removeBtnText: { fontSize: 14, fontWeight: "700" },
});
