/**
 * PostCard component
 * Renders a summary card for a single post in the feed.
 *
 * Tapping the card navigates to the Post Detail + Comments screen.
 * The pencil icon calls onEdit immediately (no confirmation needed).
 * The trash icon opens a ConfirmModal before calling onDelete.
 * The "edited" badge appears when post.editedAt is set.
 * Tags are rendered as read-only TagChip pills at the bottom.
 *
 * Footer row:
 *   ♥  Like button — toggles the current user's like; count shown next to it.
 *   ↑  Share button — opens the native share sheet with post content.
 */

import { View, Text, StyleSheet, Pressable, Share, Image } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import TagChip from "./TagChip";
import ConfirmModal from "./ConfirmModal";
import { router } from "expo-router";
import { Post } from "../types/Post";
import { usePosts } from "../context/PostsContext";
import { useProfile } from "../context/ProfileContext";

type Props = {
  post: Post;
  colors: any;
  /** Called when the user taps the edit (pencil) icon */
  onEdit: () => void;
  /** Called after the user confirms the delete modal */
  onDelete: () => void;
};

export default function PostCard({ post, colors, onEdit, onDelete }: Props) {
  const { likePost } = usePosts();
  const { profile } = useProfile();

  // Track whether the delete confirm modal is showing
  const [deleteVisible, setDeleteVisible] = useState(false);

  const likes = post.likes ?? [];
  const isLiked = likes.includes(profile.username);
  const isOwn = post.username === profile.username;
  // Only count non-deleted comments — matches the heading on the post detail screen
  const commentCount = post.comments.filter((c) => !c.deletedAt).length;

  /** Toggles the current user's like on the post */
  async function handleLike(e: any) {
    e.stopPropagation?.();
    await likePost(post.id);
  }

  /** Opens the native share sheet with a preview of the post */
  async function handleShare(e: any) {
    e.stopPropagation?.();
    await Share.share({
      message: `Check out "${post.title}" by @${post.username} on Hobbily!\n\n${post.body}`,
      title: post.title,
    });
  }

  return (
    <>
      {/* Outer Pressable navigates to the post detail screen on tap */}
      <Pressable onPress={() => router.push(`/post/${post.id}`)}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* ── Header: author on left, edit/delete icons on right ── */}
          <View style={styles.header}>
            <Text style={[styles.username, { color: colors.text }]}>@{post.username}</Text>
            {/* Edit/delete are only ever available to the post's own author */}
            {isOwn && (
              <View style={styles.actions}>
                {/* stopPropagation prevents the card's onPress from also firing */}
                <Pressable onPress={(e) => { e.stopPropagation?.(); onEdit(); }} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                </Pressable>
                <Pressable onPress={(e) => { e.stopPropagation?.(); setDeleteVisible(true); }} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Post title ── */}
          <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>

          {/* Attached photo, if any */}
          {!!post.imageUrl && (
            <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
          )}

          {/* Body preview — capped at 2 lines; full text visible on the detail screen */}
          <Text style={[styles.content, { color: colors.secondaryText }]} numberOfLines={2}>
            {post.body}
          </Text>

          {/* "edited" badge — only visible when the post has been modified after creation */}
          {post.editedAt && (
            <Text style={[styles.edited, { color: colors.secondaryText }]}>✎ edited</Text>
          )}

          {/* Read-only tag chips */}
          <View style={styles.tagRow}>
            {post.tags.map((tag) => (
              <TagChip key={tag} label={tag} textColor="#fff" backgroundColor={colors.primary} />
            ))}
          </View>

          {/* ── Footer: like + comments + share ── */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {/* Like button — filled heart when liked, outline when not */}
            <Pressable onPress={handleLike} style={styles.footerAction} hitSlop={8}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={17}
                color={isLiked ? "#DC2626" : colors.secondaryText}
              />
              <Text style={[styles.footerCount, { color: colors.secondaryText }]}>
                {likes.length}
              </Text>
            </Pressable>

            {/* Comments — tapping opens the post detail screen where comments live */}
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); router.push(`/post/${post.id}`); }}
              style={styles.footerAction}
              hitSlop={8}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.secondaryText} />
              <Text style={[styles.footerCount, { color: colors.secondaryText }]}>
                {commentCount}
              </Text>
            </Pressable>

            {/* Share button */}
            <Pressable onPress={handleShare} style={styles.footerAction} hitSlop={8}>
              <Ionicons name="share-outline" size={17} color={colors.secondaryText} />
              <Text style={[styles.footerLabel, { color: colors.secondaryText }]}>Share</Text>
            </Pressable>
          </View>

        </View>
      </Pressable>

      {/* Delete confirmation modal — rendered outside the card Pressable */}
      <ConfirmModal
        visible={deleteVisible}
        title="Delete Post"
        message="Are you sure you want to delete this post? This cannot be undone."
        confirmLabel="Delete"
        dangerous
        onConfirm={() => { setDeleteVisible(false); onDelete(); }}
        onCancel={() => setDeleteVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 10, borderWidth: 1, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  username: { fontWeight: "bold" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  postImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8, marginBottom: 6 },
  content: { marginBottom: 6 },
  edited: { fontSize: 11, fontStyle: "italic", marginBottom: 4 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 4 },
  // Footer row below tags
  footer: { flexDirection: "row", gap: 16, marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerCount: { fontSize: 13 },
  footerLabel: { fontSize: 13 },
});
