/**
 * Public Profile — the full-screen profile, reached via UserCardSheet's
 * "View full profile" action. UserCardSheet stays a compact preview (per
 * its own doc comment); this is where all of a user's public information,
 * posts, and workshop activity actually live.
 *
 * Tabs: Overview / Posts / Workshops. Achievements aren't a separate tab —
 * only featuredAchievementIds are ever public (see firestore.rules), so
 * there's not enough data to justify a 4th tab; the featured ones are shown
 * in Overview instead, exactly like UserCardSheet.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { usePosts } from "../../context/PostsContext";
import { friendlyMessage, useFriends } from "../../context/FriendsContext";
import { FriendSearchResult } from "../../services/friendsService";
import { useAuthorPosts } from "../../hooks/useAuthorPosts";
import { useProfileActivityStats } from "../../hooks/useProfileActivityStats";
import { fetchUserWorkshops } from "../../services/workshopService";
import { WorkshopParticipant } from "../../types/Workshop";
import { opportunityById } from "../../constants/opportunities";
import { achievementDefById } from "../../constants/achievements";
import { previewWithOverflow } from "../../utils/previewList";
import FriendAvatar from "../../components/friends/FriendAvatar";
import PersonalityBadge from "../../components/PersonalityBadge";
import TagChip from "../../components/TagChip";
import PostCard from "../../components/PostCard";
import PostCardSkeleton from "../../components/post/PostCardSkeleton";
import ConfirmModal from "../../components/ConfirmModal";
import AchievementDetailSheet from "../../components/achievements/AchievementDetailSheet";
import ProfileStatGrid, { StatCell } from "../../components/profile/ProfileStatGrid";
import UserCardSheet from "../../components/user-card/UserCardSheet";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";

const AVATAR_SIZE = 108;
type Tab = "overview" | "posts" | "workshops";

export default function PublicProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { getUserCard, sendRequest, acceptRequest, removeFriendship, actionState } = useFriends();
  const { deletePost } = usePosts();

  const [tab, setTab] = useState<Tab>("overview");
  const [result, setResult] = useState<FriendSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);
  const { selectedUid: cardUid, openUserProfile: openCard, closeUserProfile: closeCard } = useUserProfileSheet();

  const [workshops, setWorkshops] = useState<WorkshopParticipant[] | null>(null);
  const [workshopsError, setWorkshopsError] = useState<string | null>(null);

  const stats = useProfileActivityStats(uid ?? null);
  const { posts, isLoading: postsLoading, loadError: postsError, hasMore, loadMore } = useAuthorPosts(tab === "posts" ? uid ?? null : null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getUserCard(uid)
      .then((r) => { if (!cancelled) { setResult(r); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setLoadError(friendlyMessage(e)); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const loadWorkshops = useCallback(() => {
    if (!uid) return;
    setWorkshopsError(null);
    fetchUserWorkshops(uid)
      .then(setWorkshops)
      .catch((e) => { if (__DEV__) console.warn("[PublicProfile] failed to load workshops", e); setWorkshopsError("Couldn't load workshops. Please try again."); });
  }, [uid]);

  useEffect(() => {
    if (tab === "workshops" && workshops === null && !workshopsError) loadWorkshops();
  }, [tab, workshops, workshopsError, loadWorkshops]);

  const profile = result?.profile ?? null;
  const isOwnUid = user?.uid === uid;

  const { kind, label } = useMemo(() => {
    const relationship = result?.relationship ?? "none";
    if (relationship === "self") return { kind: "self" as const, label: "" };
    if (relationship === "friends") return { kind: "friends" as const, label: "Friends" };
    if (relationship === "outgoing_pending") return { kind: "requested" as const, label: "Request Sent" };
    if (relationship === "incoming_pending") return { kind: "accept" as const, label: "Accept Request" };
    return { kind: "add" as const, label: "Add Friend" };
  }, [result?.relationship]);

  const sendKey = profile ? `send:${profile.uid}` : "";
  const acceptKey = result?.friendshipId ? `accept:${result.friendshipId}` : "";
  const removeKey = result?.friendshipId ? `remove:${result.friendshipId}` : "";
  const actionLoading = actionState[sendKey] === "loading" || actionState[acceptKey] === "loading" || actionState[removeKey] === "loading";

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

  const statCells: StatCell[] = [
    { key: "communities", icon: "people-outline", label: "Communities", value: stats.communityCount, onPress: () => router.push(`/profile-activity/${uid}?tab=communities` as any) },
    { key: "workshops", icon: "school-outline", label: "Workshops", value: stats.workshopCount, onPress: () => router.push(`/profile-activity/${uid}?tab=workshops` as any) },
    { key: "hobbies", icon: "heart-outline", label: "Hobbies", value: profile ? profile.hobbies.length : null },
    { key: "streak", icon: "flame", label: "Day streak", value: profile ? Math.max(0, profile.currentStreak || 0) : null },
  ];

  const { visible: visibleHobbies, overflowCount: hobbyOverflow } = previewWithOverflow(profile?.hobbies ?? [], 100);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{profile?.username || "Profile"}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.secondaryText} />
        </View>
      ) : loadError || !profile ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.secondaryText} />
          <Text style={{ color: colors.secondaryText, fontSize: 14, marginTop: 8 }}>{loadError || "This profile is no longer available."}</Text>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <View style={styles.hero}>
              <TouchableOpacity
                onPress={() => profile.avatarUrl && setAvatarPreviewVisible(true)}
                disabled={!profile.avatarUrl}
                accessibilityRole={profile.avatarUrl ? "button" : undefined}
                accessibilityLabel={profile.avatarUrl ? "View full-size photo" : undefined}
              >
                <FriendAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={AVATAR_SIZE} colors={colors} />
              </TouchableOpacity>
              <Text style={[styles.name, { color: colors.text }]}>{profile.username || "User"}</Text>
              <Text style={[styles.username, { color: colors.secondaryText }]}>@{profile.username || "user"}</Text>

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
              {profile.city ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color={colors.secondaryText} />
                  <Text style={[styles.metaText, { color: colors.secondaryText }]}>{profile.city}</Text>
                </View>
              ) : null}

              {actionError ? <Text style={[styles.actionError, { color: colors.danger }]}>{actionError}</Text> : null}

              {!isOwnUid && (kind === "add" || kind === "requested" || kind === "accept") && (
                <TouchableOpacity
                  onPress={handlePrimaryAction}
                  disabled={kind === "requested" || actionLoading}
                  style={[
                    styles.primaryAction,
                    kind === "add" || kind === "accept" ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText} />
                  ) : (
                    <Text style={{ color: kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText, fontWeight: "700", fontSize: 15 }}>{label}</Text>
                  )}
                </TouchableOpacity>
              )}
              {kind === "friends" && !isOwnUid && (
                <TouchableOpacity onPress={() => setRemoveConfirmVisible(true)} disabled={actionLoading} style={styles.removeAction} accessibilityRole="button" accessibilityLabel={`Remove ${profile.username} from friends`}>
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="person-remove-outline" size={13} color={colors.danger} style={{ marginRight: 5 }} />
                      <Text style={[styles.removeActionText, { color: colors.danger }]}>Remove Friend</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {(["overview", "posts", "workshops"] as Tab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tabPill, tab === t && { backgroundColor: colors.primary }]}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                >
                  <Text style={[styles.tabPillText, { color: tab === t ? "#fff" : colors.secondaryText }]}>
                    {t === "overview" ? "Overview" : t === "posts" ? "Posts" : "Workshops"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === "overview" && (
              <View style={styles.tabContent}>
                <ProfileStatGrid cells={statCells} colors={colors} />

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
                      {visibleHobbies.map((tag) => (
                        <TagChip key={tag} label={tag} textColor={colors.primary} backgroundColor={`${colors.primary}14`} />
                      ))}
                      {hobbyOverflow > 0 && <TagChip label={`+${hobbyOverflow} more`} textColor={colors.secondaryText} backgroundColor={colors.card} />}
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
                          <TouchableOpacity key={id} onPress={() => setOpenAchievementId(id)} style={[styles.achievementChip, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel={`${def.title} — view details`}>
                            <Ionicons name={def.icon as any} size={20} color="#fff" />
                            <Text style={styles.achievementChipText} numberOfLines={1}>{def.title}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {tab === "posts" && (
              <View style={styles.tabContent}>
                {postsLoading ? (
                  <>
                    <PostCardSkeleton colors={colors} />
                    <PostCardSkeleton colors={colors} />
                  </>
                ) : postsError ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="cloud-offline-outline" size={26} color={colors.secondaryText} />
                    <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{postsError}</Text>
                  </View>
                ) : posts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="document-text-outline" size={26} color={colors.secondaryText} />
                    <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No posts yet</Text>
                  </View>
                ) : (
                  <>
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        colors={colors}
                        authorAvatarUrl={profile.avatarUrl}
                        onEdit={() => router.push(`/edit-post/${post.id}` as any)}
                        onDelete={() => deletePost(post.id)}
                        onOpenUser={openCard}
                      />
                    ))}
                    {hasMore && (
                      <TouchableOpacity onPress={loadMore} style={[styles.loadMoreBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>Load more</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}

            {tab === "workshops" && (
              <View style={styles.tabContent}>
                {workshopsError ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="cloud-offline-outline" size={26} color={colors.secondaryText} />
                    <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{workshopsError}</Text>
                  </View>
                ) : workshops === null ? (
                  <ActivityIndicator size="small" color={colors.secondaryText} style={{ marginTop: 20 }} />
                ) : workshops.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="school-outline" size={26} color={colors.secondaryText} />
                    <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No workshops joined yet</Text>
                  </View>
                ) : (
                  workshops.map((w) => {
                    const opp = opportunityById(w.workshopId);
                    if (!opp) return null;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.workshopCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => router.push("/(tabs)/opportunities" as any)}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.workshopName, { color: colors.text }]} numberOfLines={1}>{opp.name}</Text>
                          <Text style={[styles.workshopOrg, { color: colors.secondaryText }]} numberOfLines={1}>{opp.organisation}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </>
      )}

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

      <Modal visible={avatarPreviewVisible} transparent animationType="fade" onRequestClose={() => setAvatarPreviewVisible(false)}>
        <Pressable style={styles.avatarPreviewBackdrop} onPress={() => setAvatarPreviewVisible(false)} accessibilityLabel="Close photo preview">
          {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarPreviewImage} resizeMode="cover" /> : null}
        </Pressable>
      </Modal>

      <AchievementDetailSheet
        achievementId={openAchievementId}
        onClose={() => setOpenAchievementId(null)}
        colors={colors}
        unlockedAchievements={openAchievementId ? [{ id: openAchievementId, title: "", description: "", icon: "", earnedAt: "" }] : []}
        currentStats={{ totalSessions: 0, totalMinutes: 0, currentStreak: 0 }}
      />

      <UserCardSheet uid={cardUid} colors={colors} onClose={closeCard} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scrollContent: { paddingBottom: 24 },
  hero: { alignItems: "center", gap: 4, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  name: { fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: 12 },
  username: { fontSize: 14, textAlign: "center" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  statusBadgeText: { fontSize: 12, fontWeight: "700" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  metaText: { fontSize: 13 },
  actionError: { fontSize: 12, textAlign: "center", marginTop: 8 },
  primaryAction: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 14, minWidth: 160 },
  removeAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, marginTop: 4 },
  removeActionText: { fontSize: 13, fontWeight: "600" },
  tabRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginHorizontal: 16, marginTop: 8 },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabPillText: { fontSize: 13, fontWeight: "700" },
  tabContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  bio: { fontSize: 14, lineHeight: 20 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  achievementRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  achievementChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, maxWidth: "100%" },
  achievementChipText: { color: "#fff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center" },
  loadMoreBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  workshopCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  workshopName: { fontSize: 14, fontWeight: "700" },
  workshopOrg: { fontSize: 12, marginTop: 2 },
  avatarPreviewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  avatarPreviewImage: { width: "88%", aspectRatio: 1, borderRadius: 16 },
});
