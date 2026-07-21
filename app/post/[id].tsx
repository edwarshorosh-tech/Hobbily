/**
 * Post Detail + Comments screen
 * Shows the full post content (title, body, tags, author, date, edit badge),
 * a like button, a share button, then the comment thread (top-level
 * comments with up to one level of nested replies), then a reply box.
 *
 * Comments/likes are Firestore subcollections (see hooks/usePostComments.ts
 * and services/postsService.ts) — not inline arrays — so two people
 * commenting or liking at the same moment can never clobber each other, and
 * ownership (edit/delete your own comment, like/unlike your own like) is
 * enforced by firestore.rules against each item's own authorId/uid, not by
 * trusting the client.
 */
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { usePosts } from "../../context/PostsContext";
import { useAuth } from "../../context/AuthContext";
import { usePostComments } from "../../hooks/usePostComments";
import { useAuthorProfiles } from "../../hooks/useAuthorProfiles";
import { useEffect, useMemo, useRef, useState } from "react";
import PrimaryButton from "../../components/PrimaryButton";
import TagChip from "../../components/TagChip";
import ConfirmModal from "../../components/ConfirmModal";
import FriendAvatar from "../../components/friends/FriendAvatar";
import UserCardSheet from "../../components/user-card/UserCardSheet";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";
import { Comment, Post } from "../../types/Post";
import { subscribeToPost } from "../../services/postsService";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type CommentThread = { root: Comment; replies: Comment[] };

/** Groups a flat, oldest-first comment list into top-level threads with their direct replies — deliberately flat beyond one level (parentCommentId always points at a *root* comment; see addComment's parentCommentId usage below), matching the "no infinite nesting" requirement. */
function buildThreads(comments: Comment[]): CommentThread[] {
  const roots: CommentThread[] = [];
  const byId = new Map<string, CommentThread>();
  for (const c of comments) {
    if (!c.parentCommentId) {
      const thread: CommentThread = { root: c, replies: [] };
      byId.set(c.id, thread);
      roots.push(thread);
    }
  }
  for (const c of comments) {
    if (c.parentCommentId) {
      const parentThread = byId.get(c.parentCommentId);
      if (parentThread) parentThread.replies.push(c);
      // A reply whose root isn't loaded yet (e.g. root is on a later page)
      // is simply not shown until that page loads — never crashes.
    }
  }
  return roots;
}

function CommentBubble({
  comment,
  isReply,
  colors,
  isOwn,
  isLiked,
  avatarUrl,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onOpenAuthor,
}: {
  comment: Comment;
  isReply: boolean;
  colors: any;
  isOwn: boolean;
  isLiked: boolean;
  avatarUrl?: string | null;
  onLike: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenAuthor: () => void;
}) {
  if (comment.deletedAt) {
    return (
      <View style={[styles.commentBubble, styles.deletedBubble, { borderColor: colors.border }, isReply && styles.replyIndent]}>
        <Text style={[styles.deletedText, { color: colors.secondaryText }]}>This comment was deleted.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.commentBubble, { backgroundColor: colors.card, borderColor: colors.border }, isReply && styles.replyIndent]}>
      <Pressable onPress={onOpenAuthor} style={styles.commentAuthorRow} accessibilityRole="button" accessibilityLabel={`View ${comment.username}'s profile`}>
        <FriendAvatar username={comment.username} avatarUrl={avatarUrl ?? null} size={22} colors={colors} />
        <Text style={[styles.commentUsername, { color: colors.text }]}>@{comment.username}</Text>
        <Text style={[styles.commentDate, { color: colors.secondaryText }]}>
          {new Date(comment.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Text>
        {isOwn && (
          <View style={styles.commentActions}>
            <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit comment">
              <Ionicons name="pencil-outline" size={15} color={colors.primary} />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete comment">
              <Ionicons name="trash-outline" size={15} color="#DC2626" />
            </Pressable>
          </View>
        )}
      </Pressable>

      <Text style={[styles.commentContent, { color: colors.secondaryText }]}>{comment.content}</Text>
      {comment.editedAt && <Text style={[styles.editedBadge, { color: colors.secondaryText }]}>✎ edited</Text>}

      <View style={styles.commentFooterRow}>
        <Pressable onPress={onLike} style={styles.commentFooterAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={isLiked ? "Unlike comment" : "Like comment"}>
          <Ionicons name={isLiked ? "heart" : "heart-outline"} size={14} color={isLiked ? "#DC2626" : colors.secondaryText} />
          <Text style={[styles.commentFooterText, { color: colors.secondaryText }]}>{comment.likeCount}</Text>
        </Pressable>
        {!isReply && (
          <Pressable onPress={onReply} style={styles.commentFooterAction} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reply">
            <Ionicons name="arrow-undo-outline" size={14} color={colors.secondaryText} />
            <Text style={[styles.commentFooterText, { color: colors.secondaryText }]}>Reply</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function PostDetail() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const postId = id ?? "";
  const { posts, toggleLike: toggleLikePost, likedPostIds } = usePosts();
  const { user } = useAuth();
  const {
    comments,
    isLoading: commentsLoading,
    loadError: commentsError,
    likedCommentIds,
    hasMore,
    loadingMore,
    loadMore,
    addComment,
    editComment,
    deleteComment,
    toggleLike: toggleCommentLike,
  } = usePostComments(postId);

  const contextPost = posts.find((p) => p.id === id);
  // Live single-doc subscription — the authoritative source once it resolves,
  // so like/comment counts stay correct even for a post on an older
  // (non-realtime) feed page, and the screen still works for a deep link to
  // a post the feed hasn't loaded this session. `contextPost` is only used
  // as an instant first-paint value while this subscription's first
  // snapshot is still in flight, to avoid a loading flash for the common
  // case (opened from an already-visible PostCard).
  const [livePost, setLivePost] = useState<Post | null | undefined>(undefined);
  const [postLoadError, setPostLoadError] = useState<string | null>(null);
  const [postRetryTick, setPostRetryTick] = useState(0);

  useEffect(() => {
    setLivePost(undefined);
    setPostLoadError(null);
    const unsub = subscribeToPost(
      postId,
      (p) => setLivePost(p),
      () => setPostLoadError("Couldn't load this post. Please check your connection and try again.")
    );
    return unsub;
  }, [postId, postRetryTick]);

  const post = livePost !== undefined ? (livePost ?? undefined) : contextPost;

  const [newComment, setNewComment] = useState("");
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const { selectedUid: cardUid, openUserProfile: setCardUid, closeUserProfile: closeCardUid } = useUserProfileSheet();

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const authorIds = useMemo(
    () => [post?.authorId, ...comments.map((c) => c.authorId)],
    [post?.authorId, comments]
  );
  const authorProfiles = useAuthorProfiles(authorIds);

  // Opened via PostCard's Comment action ("...?focus=comment") — focus the
  // reply box once the screen has something to focus.
  useEffect(() => {
    if (focus === "comment") {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [focus]);

  const threads = useMemo(() => buildThreads(comments), [comments]);
  const visibleCommentCount = post?.commentCount ?? 0;

  if (!post) {
    // Still waiting on the live subscription's first snapshot, and nothing
    // to paint from the feed in the meantime — a brief loading state, not a
    // false "not found."
    if (livePost === undefined && !contextPost && !postLoadError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={colors.secondaryText} />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.notFoundContainer}>
          <Text style={[styles.notFoundText, { color: colors.text }]}>
            {postLoadError ?? "Post not found."}
          </Text>
          {postLoadError && (
            <Pressable
              onPress={() => setPostRetryTick((t) => t + 1)}
              style={[styles.backBtn, { backgroundColor: colors.primary, marginBottom: 10 }]}
            >
              <Text style={styles.backBtnText}>Retry</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Narrowed alias for use inside the handlers below — `post` is guaranteed
  // non-null past the guard above, but TS doesn't carry that narrowing into
  // nested function declarations.
  const p = post;

  const isLikedPost = likedPostIds.has(p.id);
  const createdDate = new Date(p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  async function handleAddComment() {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    setPostError(null);
    const body = newComment.trim();
    try {
      await addComment(body, replyTarget?.id ?? null);
      setNewComment("");
      setReplyTarget(null);
    } catch {
      // Text is preserved (not cleared) on failure so the user can retry without retyping.
      setPostError("Couldn't post your comment. Please check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  function startReply(c: Comment) {
    setReplyTarget(c);
    inputRef.current?.focus();
  }

  function startEdit(c: Comment) {
    setEditingCommentId(c.id);
    setEditDraft(c.content);
  }

  async function handleSaveEdit(commentId: string) {
    if (!editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await editComment(commentId, editDraft.trim());
      setEditingCommentId(null);
      setEditDraft("");
    } catch {
      // keep edit mode open with the draft intact so the user can retry
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteComment(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare() {
    try {
      await Share.share({ message: `Check out "${p.title}" by @${p.username} on Hobbily!\n\n${p.body}`, title: p.title });
    } catch {
      // Share.share() rejects on user cancel or an unsupported browser — neither is a real error.
    }
  }

  function renderComment(c: Comment, isReply: boolean) {
    return (
      <CommentBubble
        key={c.id}
        comment={c}
        isReply={isReply}
        colors={colors}
        isOwn={!!user && c.authorId === user.uid}
        isLiked={likedCommentIds.has(c.id)}
        avatarUrl={authorProfiles.get(c.authorId)?.avatarUrl}
        onLike={() => toggleCommentLike(c.id)}
        onReply={() => startReply(c)}
        onEdit={() => startEdit(c)}
        onDelete={() => setDeleteTarget(c.id)}
        onOpenAuthor={() => setCardUid(c.authorId)}
      />
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => router.back()} style={styles.backPressable} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to feed">
              <Ionicons name="arrow-back" size={22} color={colors.primary} />
              <Text style={[styles.backLabel, { color: colors.primary }]}>Feed</Text>
            </Pressable>
          </View>

          <FlatList
            data={threads}
            keyExtractor={(t) => t.root.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            ListHeaderComponent={
              <>
                <Pressable
                  onPress={() => setCardUid(p.authorId)}
                  style={styles.postAuthorRow}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${post.username}'s profile`}
                >
                  <FriendAvatar username={post.username} avatarUrl={authorProfiles.get(post.authorId)?.avatarUrl ?? null} size={32} colors={colors} />
                  <Text style={[styles.username, { color: colors.secondaryText }]}>@{post.username}</Text>
                </Pressable>
                <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>
                <Text style={[styles.meta, { color: colors.secondaryText }]}>{createdDate}</Text>

                {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />}

                <Text style={[styles.body, { color: colors.secondaryText }]}>{post.body}</Text>
                {post.editedAt && <Text style={[styles.editedBadge, { color: colors.secondaryText }]}>✎ edited</Text>}

                {post.tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {post.tags.map((tag) => (
                      <TagChip key={tag} label={tag} textColor={colors.text} />
                    ))}
                  </View>
                )}

                <View style={[styles.actionsRow, { borderColor: colors.border }]}>
                  <Pressable onPress={() => toggleLikePost(post.id)} style={styles.actionItem} hitSlop={8} accessibilityRole="button" accessibilityLabel={isLikedPost ? "Unlike post" : "Like post"}>
                    <Ionicons name={isLikedPost ? "heart" : "heart-outline"} size={22} color={isLikedPost ? "#DC2626" : colors.secondaryText} />
                    <Text style={[styles.actionCount, { color: colors.secondaryText }]}>
                      {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleShare} style={styles.actionItem} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share post">
                    <Ionicons name="share-outline" size={22} color={colors.secondaryText} />
                    <Text style={[styles.actionLabel, { color: colors.secondaryText }]}>Share</Text>
                  </Pressable>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <View style={styles.commentsHeader}>
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.text} />
                  <Text style={[styles.commentsHeading, { color: colors.text }]}>
                    {visibleCommentCount === 0 ? "Comments" : `Comments (${visibleCommentCount})`}
                  </Text>
                  {commentsLoading && <ActivityIndicator size="small" color={colors.secondaryText} style={{ marginLeft: 8 }} />}
                </View>

                {commentsError && (
                  <View style={[styles.emptyComments, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="cloud-offline-outline" size={24} color={colors.secondaryText} />
                    <Text style={[styles.emptyCommentsText, { color: colors.secondaryText }]}>{commentsError}</Text>
                  </View>
                )}

                {!commentsLoading && !commentsError && threads.length === 0 && (
                  <View style={[styles.emptyComments, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="chatbubble-outline" size={28} color={colors.secondaryText} />
                    <Text style={[styles.emptyCommentsText, { color: colors.secondaryText }]}>No comments yet.{"\n"}Be the first to reply!</Text>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) =>
              editingCommentId === item.root.id ? (
                <View style={[styles.commentBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, borderColor: colors.border }]}
                    value={editDraft}
                    onChangeText={setEditDraft}
                    multiline
                    autoFocus
                  />
                  <View style={styles.editButtons}>
                    <PrimaryButton
                      label={savingEdit ? "Saving..." : "Save"}
                      onPress={() => handleSaveEdit(item.root.id)}
                      buttonStyle={{ backgroundColor: colors.primary, flex: 1 }}
                      textStyle={{ color: colors.text }}
                    />
                    <PrimaryButton
                      label="Cancel"
                      onPress={() => { setEditingCommentId(null); setEditDraft(""); }}
                      buttonStyle={{ backgroundColor: colors.border, flex: 1 }}
                      textStyle={{ color: colors.text }}
                    />
                  </View>
                </View>
              ) : (
                <View>
                  {renderComment(item.root, false)}
                  {item.replies.map((r) => renderComment(r, true))}
                </View>
              )
            }
            ListFooterComponent={
              hasMore ? (
                <Pressable
                  onPress={loadMore}
                  disabled={loadingMore}
                  style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Load more comments"
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.secondaryText} />
                  ) : (
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>Load more comments</Text>
                  )}
                </Pressable>
              ) : null
            }
          />

          <View
            style={[
              styles.replyBox,
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(12, insets.bottom) },
            ]}
          >
            {replyTarget && (
              <View style={styles.replyingToRow}>
                <Text style={[styles.replyLabel, { color: colors.text }]}>Replying to @{replyTarget.username}</Text>
                <Pressable onPress={() => setReplyTarget(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
                </Pressable>
              </View>
            )}
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder="Write a comment..."
              placeholderTextColor={colors.secondaryText}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={1000}
            />
            {postError && <Text style={[styles.hint, { color: colors.danger }]}>{postError}</Text>}
            <PrimaryButton
              label={posting ? "Posting..." : "Post Comment"}
              onPress={handleAddComment}
              buttonStyle={{ backgroundColor: colors.primary, opacity: newComment.trim() && !posting ? 1 : 0.6 }}
              textStyle={{ color: colors.text }}
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Delete comment?"
        message="This comment will be removed and replaced with a deleted placeholder."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        dangerous
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <UserCardSheet uid={cardUid} colors={colors} onClose={closeCardUid} />
    </>
  );
}

const styles = StyleSheet.create({
  navBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backPressable: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 16 },

  postAuthorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  username: { fontSize: 13 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  meta: { fontSize: 12, marginBottom: 10 },
  postImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12, marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  editedBadge: { fontSize: 11, fontStyle: "italic", marginBottom: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },

  actionsRow: { flexDirection: "row", gap: 24, paddingVertical: 12, marginVertical: 4, borderTopWidth: 1, borderBottomWidth: 1 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontSize: 14 },
  actionLabel: { fontSize: 14 },

  divider: { height: 1, marginVertical: 16 },

  commentsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  commentsHeading: { fontSize: 17, fontWeight: "600" },

  emptyComments: { alignItems: "center", padding: 24, borderRadius: 12, borderWidth: 1, marginBottom: 16, gap: 8 },
  emptyCommentsText: { textAlign: "center", fontSize: 14, lineHeight: 20 },

  commentBubble: { padding: 12, borderRadius: 10, borderWidth: 1, marginVertical: 4 },
  replyIndent: { marginLeft: 28 },
  commentAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  commentUsername: { fontWeight: "600", fontSize: 13 },
  commentDate: { fontSize: 11, flex: 1 },
  commentContent: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: "row", gap: 10 },
  commentFooterRow: { flexDirection: "row", gap: 16, marginTop: 6 },
  commentFooterAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  commentFooterText: { fontSize: 12 },

  deletedBubble: { backgroundColor: "transparent" },
  deletedText: { fontSize: 13, fontStyle: "italic" },

  editInput: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14, minHeight: 60 },
  editButtons: { flexDirection: "row", gap: 8 },

  loadMoreBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },

  replyBox: { padding: 12, borderTopWidth: 1 },
  replyingToRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  replyLabel: { fontWeight: "600", fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 15, minHeight: 44, maxHeight: 100 },
  hint: { fontSize: 12, marginBottom: 8 },

  notFoundContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  notFoundText: { fontSize: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
});
