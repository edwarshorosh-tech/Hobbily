/**
 * Post Detail + Comments screen
 * Shows the full post content (title, body, tags, author, date, edit badge),
 * a like button, a share button, then all existing comments, then a reply box.
 *
 * Comment features:
 *   - Soft-deleted comments render as a greyed-out "deleted" placeholder.
 *   - Edited comments show a "✎ edited" badge.
 *   - Your own comments show pencil + trash icons for inline editing or deletion.
 *   - Deletion requires confirmation via ConfirmModal.
 *   - Inline editing replaces the comment text with a TextInput + Save/Cancel.
 *
 * All changes are persisted to AsyncStorage via PostsContext.
 */
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { usePosts } from "../../context/PostsContext";
import { useProfile } from "../../context/ProfileContext";
import { useState } from "react";
import PrimaryButton from "../../components/PrimaryButton";
import TagChip from "../../components/TagChip";
import ConfirmModal from "../../components/ConfirmModal";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PostDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, addComment, editComment, deleteComment, likePost } = usePosts();
  const { profile } = useProfile();

  // Look up the post — guard below handles null
  const post = posts.find((p) => p.id === id);

  // ── New comment input ──────────────────────────────────────────────────────
  const [newComment, setNewComment] = useState("");

  // ── Inline comment editing ─────────────────────────────────────────────────
  // null means nothing is being edited; a comment ID activates inline edit mode
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // ── Delete confirm modal ───────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Guard: post was deleted or URL is wrong
  if (!post) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.notFoundContainer}>
          <Text style={[styles.notFoundText, { color: colors.text }]}>Post not found.</Text>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Narrowed alias for use inside the handlers below — `post` is guaranteed non-null past
  // the guard above, but TS doesn't carry that narrowing into nested function declarations.
  const p = post;

  // Derived values
  const likes = post.likes ?? [];
  const isLiked = likes.includes(profile.username);
  // Only count non-deleted comments in the heading
  const visibleCommentCount = post.comments.filter((c) => !c.deletedAt).length;

  const createdDate = new Date(post.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Saves a new comment and clears the input field */
  async function handleAddComment() {
    if (!newComment.trim()) return;
    await addComment(p.id, newComment.trim());
    setNewComment("");
  }

  /** Enters inline edit mode for a comment */
  function startEdit(commentId: string, currentContent: string) {
    setEditingCommentId(commentId);
    setEditDraft(currentContent);
  }

  /** Saves the edited comment and exits edit mode */
  async function handleSaveEdit(commentId: string) {
    if (!editDraft.trim()) return;
    await editComment(p.id, commentId, editDraft.trim());
    setEditingCommentId(null);
    setEditDraft("");
  }

  /** Cancels inline editing without saving */
  function handleCancelEdit() {
    setEditingCommentId(null);
    setEditDraft("");
  }

  /** Shows the delete confirmation modal for a comment */
  function promptDelete(commentId: string) {
    setDeleteTarget(commentId);
  }

  /** Confirmed — soft-deletes the target comment */
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    await deleteComment(p.id, deleteTarget);
    setDeleteTarget(null);
  }

  /** Toggles the current user's like */
  async function handleLike() {
    await likePost(p.id);
  }

  /** Opens the native share sheet with post content */
  async function handleShare() {
    try {
      await Share.share({
        message: `Check out "${p.title}" by @${p.username} on Hobbily!\n\n${p.body}`,
        title: p.title,
      });
    } catch {
      // See PostCard.tsx's handleShare — cancel/unsupported-browser, not an error.
    }
  }

  return (
    <>
      {/* KeyboardAvoidingView shifts the reply box above the soft keyboard */}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <SafeAreaView style={{ flex: 1 }}>

          {/* ── Back navigation bar ──────────────────────────── */}
          <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} style={styles.backPressable} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
              <Text style={[styles.backLabel, { color: colors.primary }]}>Feed</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

            {/* ── Post content ─────────────────────────────────── */}
            <Text style={[styles.username, { color: colors.secondaryText }]}>
              @{post.username}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>
            <Text style={[styles.meta, { color: colors.secondaryText }]}>{createdDate}</Text>

            {/* Attached photo, if any */}
            {!!post.imageUrl && (
              <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
            )}

            <Text style={[styles.body, { color: colors.secondaryText }]}>{post.body}</Text>

            {/* "edited" badge — only shown if post was modified after creation */}
            {post.editedAt && (
              <Text style={[styles.editedBadge, { color: colors.secondaryText }]}>✎ edited</Text>
            )}

            {/* Tags row — read-only chips */}
            {post.tags.length > 0 && (
              <View style={styles.tagRow}>
                {post.tags.map((tag) => (
                  <TagChip key={tag} label={tag} textColor={colors.text} />
                ))}
              </View>
            )}

            {/* ── Like + Share action row ────────────────────────── */}
            <View style={[styles.actionsRow, { borderColor: colors.border }]}>
              {/* Like button — filled heart when liked by the current user */}
              <Pressable onPress={handleLike} style={styles.actionItem} hitSlop={8}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={22}
                  color={isLiked ? "#DC2626" : colors.secondaryText}
                />
                <Text style={[styles.actionCount, { color: colors.secondaryText }]}>
                  {likes.length} {likes.length === 1 ? "like" : "likes"}
                </Text>
              </Pressable>

              {/* Share button — opens native share sheet */}
              <Pressable onPress={handleShare} style={styles.actionItem} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={colors.secondaryText} />
                <Text style={[styles.actionLabel, { color: colors.secondaryText }]}>Share</Text>
              </Pressable>
            </View>

            {/* ── Section divider ───────────────────────────────── */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* ── Comments heading ──────────────────────────────── */}
            <View style={styles.commentsHeader}>
              <Ionicons name="chatbubbles-outline" size={18} color={colors.text} />
              <Text style={[styles.commentsHeading, { color: colors.text }]}>
                {visibleCommentCount === 0 ? "Comments" : `Comments (${visibleCommentCount})`}
              </Text>
            </View>

            {/* Empty state — shown when there are no visible comments yet */}
            {visibleCommentCount === 0 && (
              <View style={[styles.emptyComments, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="chatbubble-outline" size={28} color={colors.secondaryText} />
                <Text style={[styles.emptyCommentsText, { color: colors.secondaryText }]}>
                  No comments yet.{"\n"}Be the first to reply!
                </Text>
              </View>
            )}

            {/* ── Comment bubbles ───────────────────────────────── */}
            {post.comments.map((c) => {
              // Soft-deleted comments: show a greyed placeholder instead of content
              if (c.deletedAt) {
                return (
                  <View
                    key={c.id}
                    style={[styles.commentBubble, styles.deletedBubble, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.deletedText, { color: colors.secondaryText }]}>
                      This comment was deleted.
                    </Text>
                  </View>
                );
              }

              const isOwn = c.username === profile.username;
              const isEditing = editingCommentId === c.id;

              return (
                <View
                  key={c.id}
                  style={[styles.commentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {/* Author row — edit/delete icons only on own comments */}
                  <View style={styles.commentAuthorRow}>
                    <Ionicons name="person-circle-outline" size={18} color={colors.secondaryText} />
                    <Text style={[styles.commentUsername, { color: colors.text }]}>@{c.username}</Text>
                    <Text style={[styles.commentDate, { color: colors.secondaryText }]}>
                      {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>

                    {/* Edit / delete controls — only visible for the author's own comments */}
                    {isOwn && !isEditing && (
                      <View style={styles.commentActions}>
                        <Pressable onPress={() => startEdit(c.id, c.content)} hitSlop={8}>
                          <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => promptDelete(c.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* ── Inline edit mode ──────────────────────────── */}
                  {isEditing ? (
                    <View style={styles.editArea}>
                      <TextInput
                        style={[styles.editInput, { color: colors.text, borderColor: colors.border }]}
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        autoFocus
                      />
                      <View style={styles.editButtons}>
                        <PrimaryButton
                          label="Save"
                          onPress={() => handleSaveEdit(c.id)}
                          buttonStyle={{ backgroundColor: colors.primary, flex: 1 }}
                          textStyle={{ color: colors.text }}
                        />
                        <PrimaryButton
                          label="Cancel"
                          onPress={handleCancelEdit}
                          buttonStyle={{ backgroundColor: colors.border, flex: 1 }}
                          textStyle={{ color: colors.text }}
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.commentContent, { color: colors.secondaryText }]}>
                        {c.content}
                      </Text>
                      {/* "edited" badge — only shown if the comment was modified */}
                      {c.editedAt && (
                        <Text style={[styles.editedBadge, { color: colors.secondaryText }]}>
                          ✎ edited
                        </Text>
                      )}
                    </>
                  )}
                </View>
              );
            })}

            {/* ── Reply box ────────────────────────────────────── */}
            <View style={[styles.replyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Shows who the comment will be posted as */}
              <Text style={[styles.replyLabel, { color: colors.text }]}>
                Replying as @{profile.username}
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="Write a comment..."
                placeholderTextColor={colors.secondaryText}
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <PrimaryButton
                label="Post Comment"
                onPress={handleAddComment}
                buttonStyle={{ backgroundColor: colors.primary }}
                textStyle={{ color: colors.text }}
              />
            </View>

          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Delete comment confirmation modal */}
      <ConfirmModal
        visible={deleteTarget !== null}
        title="Delete comment?"
        message="This comment will be removed and replaced with a deleted placeholder."
        confirmLabel="Delete"
        dangerous
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Navigation bar at top
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backPressable: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 16 },

  // Post content
  username: { fontSize: 13, marginTop: 4 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  meta: { fontSize: 12, marginBottom: 10 },
  postImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12, marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  editedBadge: { fontSize: 11, fontStyle: "italic", marginBottom: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },

  // Like + share row
  actionsRow: {
    flexDirection: "row",
    gap: 24,
    paddingVertical: 12,
    marginVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontSize: 14 },
  actionLabel: { fontSize: 14 },

  // Divider between post and comments
  divider: { height: 1, marginVertical: 16 },

  // Comments section heading
  commentsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  commentsHeading: { fontSize: 17, fontWeight: "600" },

  // Empty comments state
  emptyComments: {
    alignItems: "center",
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  emptyCommentsText: { textAlign: "center", fontSize: 14, lineHeight: 20 },

  // Individual comment bubbles
  commentBubble: { padding: 12, borderRadius: 10, borderWidth: 1, marginVertical: 4 },
  commentAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  commentUsername: { fontWeight: "600", fontSize: 13 },
  commentDate: { fontSize: 11, flex: 1 },
  commentContent: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: "row", gap: 10 },

  // Soft-deleted comment placeholder
  deletedBubble: { backgroundColor: "transparent" },
  deletedText: { fontSize: 13, fontStyle: "italic" },

  // Inline edit controls
  editArea: { marginTop: 4 },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    fontSize: 14,
    minHeight: 60,
  },
  editButtons: { flexDirection: "row", gap: 8 },

  // Reply input box
  replyBox: { marginTop: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  replyLabel: { fontWeight: "600", fontSize: 13, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    minHeight: 60,
  },

  // Not-found fallback
  notFoundContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  notFoundText: { fontSize: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
});
