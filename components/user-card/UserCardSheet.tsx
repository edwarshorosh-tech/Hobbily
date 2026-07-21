/**
 * UserCardSheet — the one reusable "who is this person" bottom sheet, opened
 * from every place a username/avatar is tappable: community chat, the
 * friends leaderboard, the friends list, incoming/outgoing requests, post
 * authors, and comment authors.
 *
 * Callers only ever need to know a uid — this looks up the public profile
 * and the friendship relationship itself (services/friendsService.ts's
 * getUserCard), so it works equally from a post's authorId, a chat
 * message's author uid, or an already-resolved friend/request entry.
 *
 * Only ever shows publicProfiles data (username, city, bio, hobbies,
 * avatar, streak) — never age, email, or anything from the private
 * users/{uid} document.
 *
 * Design: a compact social-profile preview, not a full-screen page. There's
 * no visible close (X) button — dismissal is swipe-down (the sheet's
 * handle), backdrop tap, or Android Back, all handled by BottomSheet; the
 * backdrop's own Pressable already carries accessibilityLabel="Close" as
 * the screen-reader-reachable dismiss action. Friend status is a small
 * badge next to the identity, not a full-width button — the only real
 * "action" surface is the actual next step available (send/accept a
 * request) or, for an existing friend, a small de-emphasized "Remove
 * Friend" link, never the visually dominant element on the sheet. Height is
 * capped, not fixed — a short profile (no bio, no hobbies) renders short;
 * a fuller one scrolls within the cap.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { friendlyMessage, useFriends } from "../../context/FriendsContext";
import { FriendSearchResult } from "../../services/friendsService";
import { brand } from "../../constants/colors";
import BottomSheet from "../BottomSheet";
import ConfirmModal from "../ConfirmModal";
import FriendAvatar from "../friends/FriendAvatar";
import TagChip from "../TagChip";
import { actionFor } from "../../utils/friendCardAction";

type Props = {
  /** uid of the user to show, or null when the sheet should be closed. */
  uid: string | null;
  onClose: () => void;
  colors: ColorTokens;
};

export default function UserCardSheet({ uid, onClose, colors }: Props) {
  const { user } = useAuth();
  const { getUserCard, sendRequest, acceptRequest, removeFriendship, actionState } = useFriends();

  const [result, setResult] = useState<FriendSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);

  const visible = uid !== null;

  useEffect(() => {
    if (!uid) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    getUserCard(uid)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(friendlyMessage(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!visible) return null;

  const profile = result?.profile ?? null;
  const { label, kind } = actionFor(result?.relationship ?? "none");
  const sendKey = profile ? `send:${profile.uid}` : "";
  const acceptKey = result?.friendshipId ? `accept:${result.friendshipId}` : "";
  const removeKey = result?.friendshipId ? `remove:${result.friendshipId}` : "";
  const actionLoading =
    actionState[sendKey] === "loading" || actionState[acceptKey] === "loading" || actionState[removeKey] === "loading";
  const isOwnUid = user?.uid === uid;

  async function handlePrimaryAction() {
    if (!profile || actionLoading) return;
    setActionError(null);
    if (kind === "add") {
      const res = await sendRequest(profile.uid);
      if (!res.ok) setActionError(res.message);
      else setResult({ ...result!, relationship: "outgoing_pending" });
    } else if (kind === "accept" && result?.friendshipId) {
      const res = await acceptRequest(result.friendshipId);
      if (!res.ok) setActionError(res.message);
      else setResult({ ...result!, relationship: "friends" });
    }
  }

  async function handleConfirmRemove() {
    setRemoveConfirmVisible(false);
    if (!result?.friendshipId || actionLoading) return;
    const res = await removeFriendship(result.friendshipId);
    if (!res.ok) setActionError(res.message);
    else setResult({ ...result!, relationship: "none", friendshipId: null });
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="80%">
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.secondaryText} />
          </View>
        ) : loadError ? (
          <View style={styles.centerState}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.stateText, { color: colors.secondaryText }]}>{loadError}</Text>
          </View>
        ) : !profile ? (
          <View style={styles.centerState}>
            <Ionicons name="person-outline" size={24} color={colors.secondaryText} />
            <Text style={[styles.stateText, { color: colors.secondaryText }]}>This profile is no longer available.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <FriendAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={72} colors={colors} />
              {/* Full value, never clipped — may wrap to a second line for a long username. */}
              <Text style={[styles.name, { color: colors.text }]}>{profile.username || "User"}</Text>
              <Text style={[styles.username, { color: colors.secondaryText }]}>@{profile.username || "user"}</Text>

              {/* Compact status badge — replaces the old full-width "Friends"
                  button. It's informational, not an action; Remove Friend
                  (below, de-emphasized) is the only real action for this state. */}
              {kind === "friends" && (
                <View style={[styles.statusBadge, { backgroundColor: `${colors.primary}14` }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                  <Text style={[styles.statusBadgeText, { color: colors.primary }]}>Friends</Text>
                </View>
              )}
              {kind === "self" && (
                <View style={[styles.statusBadge, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.secondaryText }]}>This is you</Text>
                </View>
              )}

              <View style={styles.metaRow}>
                {profile.city ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={14} color={colors.secondaryText} />
                    <Text style={[styles.metaText, { color: colors.secondaryText }]}>{profile.city}</Text>
                  </View>
                ) : null}
                <View style={styles.metaItem}>
                  <Ionicons name="flame" size={14} color={brand.streakFlame} />
                  <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                    {Math.max(0, profile.currentStreak || 0)} day streak
                  </Text>
                </View>
              </View>
            </View>

            {profile.bio ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>About</Text>
                <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
              </View>
            ) : null}

            {profile.hobbies.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>Hobbies</Text>
                <View style={styles.tagWrap}>
                  {profile.hobbies.map((tag) => (
                    <TagChip key={tag} label={tag} textColor="#fff" backgroundColor={colors.primary} />
                  ))}
                </View>
              </View>
            )}

            {actionError ? (
              <Text style={[styles.actionError, { color: colors.danger }]}>{actionError}</Text>
            ) : null}

            {!isOwnUid && (kind === "add" || kind === "requested" || kind === "accept") && (
              <TouchableOpacity
                onPress={handlePrimaryAction}
                disabled={kind === "requested" || actionLoading}
                style={[
                  styles.primaryAction,
                  kind === "add" || kind === "accept"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: kind === "requested" || actionLoading }}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText} />
                ) : (
                  <Text
                    style={{
                      color: kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText,
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                  >
                    {label}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {kind === "friends" && !isOwnUid && (
              <TouchableOpacity
                onPress={() => setRemoveConfirmVisible(true)}
                disabled={actionLoading}
                style={styles.removeAction}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${profile.username} from friends`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="person-remove-outline" size={14} color={colors.danger} style={{ marginRight: 5 }} />
                    <Text style={[styles.removeActionText, { color: colors.danger }]}>Remove Friend</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </BottomSheet>

      <ConfirmModal
        visible={removeConfirmVisible}
        title="Remove Friend?"
        message={`Remove ${profile?.username || "this user"} from your friends?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        dangerous
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveConfirmVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centerState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 },
  stateText: { fontSize: 13, textAlign: "center" },
  scrollContent: { paddingBottom: 8, paddingTop: 4 },
  header: { alignItems: "center", gap: 4, marginBottom: 14, paddingHorizontal: 8 },
  // No maxWidth/numberOfLines here — the full username must always be
  // visible; it wraps to a second line instead of being clipped.
  name: { fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 8 },
  username: { fontSize: 14, textAlign: "center" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  // No numberOfLines — a long city name wraps rather than being cut off.
  metaText: { fontSize: 13, flexShrink: 1 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  bio: { fontSize: 14, lineHeight: 20 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionError: { fontSize: 12, textAlign: "center", marginBottom: 8 },
  primaryAction: { flexDirection: "row", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  removeAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, marginTop: 2 },
  removeActionText: { fontSize: 13, fontWeight: "600" },
});
