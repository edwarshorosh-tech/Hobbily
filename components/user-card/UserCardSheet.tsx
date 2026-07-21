/**
 * UserCardSheet — the one reusable "who is this person" bottom sheet, opened
 * from every place a username/avatar is tappable: community chat, the
 * friends leaderboard, the friends list, incoming/outgoing requests, post
 * authors, comment authors, and community member lists.
 *
 * Callers only ever need to know a uid — this looks up the public profile
 * and the friendship relationship itself (services/friendsService.ts's
 * getUserCard), so it works equally from a post's authorId, a chat
 * message's author uid, or an already-resolved friend/request entry.
 *
 * Only ever shows publicProfiles data (username, city, bio, hobbies,
 * avatar, streak, featured achievements, personality type when the owner
 * has chosen to show it) — never age, email, or anything from the private
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
 * capped, not fixed — a short profile (no bio, no hobbies, no featured
 * achievements) renders short; a fuller one scrolls within the cap.
 *
 * Featured achievement icons shown here are always rendered as "unlocked" —
 * firestore.rules only allows featuredAchievementIds to contain ids this
 * user's own progress doc actually lists as unlocked (see
 * isValidFeaturedAchievements in firestore.rules), so there's no locked/
 * progress state to compute for someone else's card, and no need to read
 * their private progress/{uid} doc (which this viewer can't read anyway).
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import PersonalityBadge from "../PersonalityBadge";
import AchievementDetailSheet from "../achievements/AchievementDetailSheet";
import { achievementDefById } from "../../constants/achievements";
import { actionFor } from "../../utils/friendCardAction";

type Props = {
  /** uid of the user to show, or null when the sheet should be closed. */
  uid: string | null;
  onClose: () => void;
  colors: ColorTokens;
};

const AVATAR_SIZE = 96;

export default function UserCardSheet({ uid, onClose, colors }: Props) {
  const { user } = useAuth();
  const { getUserCard, sendRequest, acceptRequest, removeFriendship, actionState } = useFriends();

  const [result, setResult] = useState<FriendSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);

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
      <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="82%">
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
              <TouchableOpacity
                onPress={() => profile.avatarUrl && setAvatarPreviewVisible(true)}
                disabled={!profile.avatarUrl}
                accessibilityRole={profile.avatarUrl ? "button" : undefined}
                accessibilityLabel={profile.avatarUrl ? "View full-size photo" : undefined}
              >
                <FriendAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={AVATAR_SIZE} colors={colors} />
              </TouchableOpacity>
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

              {profile.personalityTypeName ? (
                <View style={{ marginTop: 8 }}>
                  <PersonalityBadge personalityTypeName={profile.personalityTypeName} colors={colors} />
                </View>
              ) : null}

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

            {profile.featuredAchievementIds.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>Achievements</Text>
                <View style={styles.achievementRow}>
                  {profile.featuredAchievementIds.map((id) => {
                    const def = achievementDefById(id);
                    if (!def) return null;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() => setOpenAchievementId(id)}
                        style={[styles.achievementChip, { backgroundColor: colors.primary }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${def.title} — view details`}
                      >
                        <Ionicons name={def.icon as any} size={20} color="#fff" />
                        <Text style={styles.achievementChipText} numberOfLines={1}>{def.title}</Text>
                      </TouchableOpacity>
                    );
                  })}
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

      {/* Full-size photo preview — plain centered image, tap anywhere to
          dismiss. Not a full lightbox (no pinch-zoom/pan) — this is a quick
          "see it bigger" preview, not a photo gallery. */}
      <Modal visible={avatarPreviewVisible} transparent animationType="fade" onRequestClose={() => setAvatarPreviewVisible(false)}>
        <Pressable style={styles.avatarPreviewBackdrop} onPress={() => setAvatarPreviewVisible(false)} accessibilityLabel="Close photo preview">
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarPreviewImage} resizeMode="cover" />
          ) : null}
        </Pressable>
      </Modal>

      <AchievementDetailSheet
        achievementId={openAchievementId}
        onClose={() => setOpenAchievementId(null)}
        colors={colors}
        unlockedAchievements={
          openAchievementId ? [{ id: openAchievementId, title: "", description: "", icon: "", earnedAt: "" }] : []
        }
        currentStats={{ totalSessions: 0, totalMinutes: 0, currentStreak: 0 }}
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
  name: { fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 10 },
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
  achievementRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  achievementChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, maxWidth: "100%" },
  achievementChipText: { color: "#fff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  actionError: { fontSize: 12, textAlign: "center", marginBottom: 8 },
  primaryAction: { flexDirection: "row", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  removeAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, marginTop: 2 },
  removeActionText: { fontSize: 13, fontWeight: "600" },
  avatarPreviewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  avatarPreviewImage: { width: "88%", aspectRatio: 1, borderRadius: 16 },
});
