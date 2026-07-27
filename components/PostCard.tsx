/**
 * PostCard — the reusable post summary card used in the feed and in
 * Profile's Posts tab.
 *
 * Interaction rules:
 *  - Tapping the card body opens Post Detail.
 *  - Tapping the avatar or name opens UserCardSheet (never navigates).
 *  - Tapping Like toggles it in place — never opens Post Detail.
 *  - Tapping Comment opens Post Detail with the comment input focused.
 *  - Edit/Delete (own posts only) live behind an overflow menu, not
 *    permanently-visible icons — a bottom sheet with two options, using the
 *    same shared sheet primitive as everywhere else in the app.
 */
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Share, Image } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import TagChip from "./TagChip";
import ConfirmModal from "./ConfirmModal";
import BottomSheet from "./BottomSheet";
import FriendAvatar from "./friends/FriendAvatar";
import { Post } from "../types/Post";
import { usePosts } from "../context/PostsContext";
import { useAuth } from "../context/AuthContext";
import { previewWithOverflow } from "../utils/previewList";

const TAGS_PREVIEW_COUNT = 3;

/** "2m", "5h", "3d", or a short date once it's more than a week old. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  post: Post;
  colors: any;
  /** Resolved live from publicProfiles by the caller (see hooks/useAuthorProfiles.ts) — undefined while still loading, never a stale value cached on the post itself. */
  authorAvatarUrl?: string | null;
  onEdit: () => void;
  /** May reject (network/permission) — PostCard awaits it and keeps the confirm dialog open with an error on failure, so a rejection is never silently swallowed. */
  onDelete: () => Promise<void>;
  onOpenUser: (uid: string) => void;
};

export default function PostCard({ post, colors, authorAvatarUrl, onEdit, onDelete, onOpenUser }: Props) {
  const { toggleLike, likedPostIds } = usePosts();
  const { user } = useAuth();

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Root cause of "post doesn't actually delete" (fixed previously): the
  // old onConfirm closed the dialog and fired onDelete() without awaiting it
  // or catching a rejection — any failure vanished silently and the post
  // simply stayed because the Firestore delete never actually completed.
  // This screen never needs a manual cache-removal step on success — every
  // list that renders a PostCard (feed, My Posts, another user's profile
  // posts) is a live onSnapshot subscription (PostsContext / useAuthorPosts
  // / subscribeToPostsByAuthor), so a real deleteDoc success removes the
  // card on its own the moment Firestore pushes the next snapshot.
  //
  // Second root cause (this pass): "Delete Post" used to close the overflow
  // BottomSheet (setMenuVisible(false)) and, in the very same tick, open a
  // SEPARATE standalone native <Modal> (this ConfirmModal, not asOverlay) —
  // stacking a second Modal on top of one still animating closed (~180ms).
  // Two simultaneous Modals is the documented New-Architecture/Fabric
  // touch-drop failure mode also found and fixed in Community's message
  // delete flow (app/(tabs)/community.tsx) — same bug, this component just
  // hadn't been updated to match. Fixed the same way: the confirmation now
  // renders as this BottomSheet's own `overlay` (one native Modal, no
  // stacking, no timing guess — see BottomSheet.tsx's doc comment), so
  // tapping Delete Post no longer closes the menu at all.
  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setDeleteVisible(false);
      setMenuVisible(false);
    } catch (e) {
      setDeleteError(e instanceof Error && e.message ? e.message : "We could not delete this post. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleCancelDelete() {
    if (deleting) return;
    setDeleteVisible(false);
    setDeleteError(null);
  }

  // Closing the overflow menu by any means (backdrop tap, swipe, Android
  // back) must also clear a pending delete-confirmation being shown as its
  // overlay. Ignored mid-mutation, matching "can't close mid-delete" below.
  function closeMenu() {
    if (deleting) return;
    setMenuVisible(false);
    setDeleteVisible(false);
    setDeleteError(null);
  }

  const isLiked = likedPostIds.has(post.id);
  const isOwn = !!user && post.authorId === user.uid;
  const { visible: visibleTags, overflowCount: hiddenTagCount } = previewWithOverflow(post.tags, TAGS_PREVIEW_COUNT);
  const isLongBody = post.body.length > 220;

  function openDetail() {
    router.push(`/post/${post.id}` as any);
  }

  function openDetailFocused(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    router.push(`/post/${post.id}?focus=comment` as any);
  }

  function openAuthor(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    onOpenUser(post.authorId);
  }

  async function handleLike(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    await toggleLike(post.id);
  }

  async function handleShare(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    try {
      await Share.share({
        message: `Check out "${post.title}" by @${post.username} on Hobbily!\n\n${post.body}`,
        title: post.title,
      });
    } catch {
      // Share.share() rejects when the user cancels (native) or when the
      // browser has no Web Share API (most desktop browsers) — neither is
      // an error worth surfacing.
    }
  }

  return (
    <>
      <Pressable onPress={openDetail} style={({ pressed }) => [pressed && { opacity: 0.96 }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={openAuthor} style={styles.identity} accessibilityRole="button" accessibilityLabel={`View ${post.username}'s profile`}>
              <FriendAvatar username={post.username} avatarUrl={authorAvatarUrl ?? null} size={38} colors={colors} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                  {post.username}
                </Text>
                <Text style={[styles.metaLine, { color: colors.secondaryText }]} numberOfLines={1}>
                  @{post.username} · {relativeTime(post.createdAt)}
                  {post.editedAt ? " · edited" : ""}
                </Text>
              </View>
            </TouchableOpacity>
            {isOwn && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); setMenuVisible(true); }}
                style={styles.menuBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Post options"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Content ── */}
          {!!post.title && <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>}

          {!!post.imageUrl && (
            <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
          )}

          <Text style={[styles.body, { color: colors.secondaryText }]} numberOfLines={expanded ? undefined : 3}>
            {post.body}
          </Text>
          {isLongBody && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setExpanded((v) => !v); }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={[styles.readMore, { color: colors.primary }]}>{expanded ? "Show less" : "Read more"}</Text>
            </TouchableOpacity>
          )}

          {/* ── Tags — capped, never dominates the card ── */}
          {post.tags.length > 0 && (
            <View style={styles.tagRow}>
              {visibleTags.map((tag) => (
                <TagChip key={tag} label={tag} textColor="#fff" backgroundColor={colors.primary} />
              ))}
              {hiddenTagCount > 0 && (
                <TagChip label={`+${hiddenTagCount}`} textColor={colors.secondaryText} backgroundColor={colors.background} />
              )}
            </View>
          )}

          {/* ── Actions ── */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={handleLike} style={styles.footerAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={isLiked ? "Unlike post" : "Like post"}>
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={18} color={isLiked ? "#DC2626" : colors.secondaryText} />
              <Text style={[styles.footerCount, { color: colors.secondaryText }]}>{post.likeCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openDetailFocused} style={styles.footerAction} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comment">
              <Ionicons name="chatbubble-outline" size={17} color={colors.secondaryText} />
              <Text style={[styles.footerCount, { color: colors.secondaryText }]}>{post.commentCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleShare} style={styles.footerAction} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
              <Ionicons name="share-outline" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>

      {/* Own-post overflow menu — a sheet, not permanently-visible icons.
          Delete's confirmation renders as this same sheet's `overlay`
          (see handleConfirmDelete's comment above) instead of a second
          Modal, so it stays open underneath while confirming. */}
      <BottomSheet
        visible={menuVisible}
        onClose={closeMenu}
        colors={colors}
        maxHeight="40%"
        overlay={
          <ConfirmModal
            asOverlay
            visible={deleteVisible}
            title="Delete post?"
            message={deleteError ?? "This post will be removed and will no longer be visible. This action cannot be undone."}
            confirmLabel="Delete post"
            dangerous
            loading={deleting}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        }
      >
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => { setMenuVisible(false); onEdit(); }}
          accessibilityRole="button"
          accessibilityLabel="Edit post"
        >
          <Ionicons name="pencil-outline" size={18} color={colors.text} />
          <Text style={[styles.menuRowText, { color: colors.text }]}>Edit Post</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => { setDeleteError(null); setDeleteVisible(true); }}
          accessibilityRole="button"
          accessibilityLabel="Delete post"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.menuRowText, { color: colors.danger }]}>Delete Post</Text>
        </TouchableOpacity>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 6 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  identity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  displayName: { fontWeight: "700", fontSize: 14 },
  metaLine: { fontSize: 12, marginTop: 1 },
  menuBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  postImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  readMore: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  footer: { flexDirection: "row", gap: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerCount: { fontSize: 13 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  menuRowText: { fontSize: 15, fontWeight: "600" },
});
