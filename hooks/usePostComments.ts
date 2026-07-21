/**
 * usePostComments — everything a post-detail screen needs for one post's
 * comment thread: live first page, "load more" for older... actually
 * earlier pages (comments are ordered oldest-first so replies read
 * top-to-bottom like a conversation), add/edit/delete, and per-comment like
 * state for the current user. Kept out of PostsContext deliberately — a
 * post's comments should only ever be fetched while its detail screen is
 * open, never as part of loading the feed (see context/PostsContext.tsx).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Comment } from "../types/Post";
import {
  COMMENTS_PAGE_SIZE,
  addComment as persistAddComment,
  editComment as persistEditComment,
  deleteComment as persistDeleteComment,
  fetchMoreComments,
  subscribeToComments,
  subscribeToLikedCommentIds,
  toggleCommentLike,
  PostsServiceError,
} from "../services/postsService";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../context/ProfileContext";
import { mergePages, nextHasMoreAfterLiveUpdate } from "../utils/pagination";
import { isValidCommentText, normalizeCommentText } from "../utils/commentValidation";

function friendlyMessage(e: unknown): string {
  if (e instanceof PostsServiceError) {
    if (e.code === "permission-denied") return "You don't have permission to do that.";
    if (e.code === "network-error") return "Network error — please try again.";
    if (e.code === "not-found") return e.message;
  }
  return "Something went wrong. Please try again.";
}

export function usePostComments(postId: string) {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [likeInFlight, setLikeInFlight] = useState<Set<string>>(new Set());
  const olderPages = useRef<Comment[]>([]); // pages loaded via loadMore, oldest-first, prepended before the live page

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    olderPages.current = [];
    const unsub = subscribeToComments(
      postId,
      (livePage) => {
        setComments(mergePages(livePage, olderPages.current, "before"));
        setHasMore((prev) => nextHasMoreAfterLiveUpdate(livePage.length, COMMENTS_PAGE_SIZE, olderPages.current.length, prev));
        setIsLoading(false);
      },
      (e) => {
        setLoadError(friendlyMessage(e));
        setIsLoading(false);
      }
    );
    return unsub;
  }, [postId]);

  useEffect(() => {
    if (!user) {
      setLikedCommentIds(new Set());
      return;
    }
    return subscribeToLikedCommentIds(user.uid, setLikedCommentIds, (e) => {
      if (__DEV__) console.warn("[usePostComments] liked-comments listener error", e);
    });
  }, [user]);

  /**
   * Loads the next page of newer comments and appends it. Comments are
   * ordered oldest-first, and the "live" page (subscribeToComments) is
   * anchored on the OLDEST COMMENTS_PAGE_SIZE comments, not the newest — so
   * for a post with more than COMMENTS_PAGE_SIZE comments, a brand new
   * comment won't appear via the live listener until the user has paged
   * forward to it with loadMore. Only ever grows the list once per call,
   * guarded against double-tap via `loadingMore`.
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || comments.length === 0) return;
    setLoadingMore(true);
    try {
      const nextPage = await fetchMoreComments(postId, comments[comments.length - 1] ?? olderPages.current[0]);
      olderPages.current = mergePages(olderPages.current, nextPage, "after");
      setComments((prev) => mergePages(prev, nextPage, "after"));
      setHasMore(nextPage.length === COMMENTS_PAGE_SIZE);
    } catch (e) {
      setLoadError(friendlyMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, comments, postId]);

  const addComment = useCallback(
    async (content: string, parentCommentId: string | null = null) => {
      if (!user) throw new PostsServiceError("permission-denied", "Please sign in again.");
      if (!isValidCommentText(content)) return;
      await persistAddComment(postId, user.uid, profile.username, normalizeCommentText(content), parentCommentId);
    },
    [user, profile.username, postId]
  );

  const editComment = useCallback(
    async (commentId: string, content: string) => {
      if (!isValidCommentText(content)) return;
      await persistEditComment(postId, commentId, normalizeCommentText(content));
    },
    [postId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      await persistDeleteComment(postId, commentId);
    },
    [postId]
  );

  const toggleLike = useCallback(
    async (commentId: string) => {
      if (!user || likeInFlight.has(commentId)) return;
      setLikeInFlight((prev) => new Set(prev).add(commentId));
      try {
        await toggleCommentLike(postId, commentId, user.uid);
      } finally {
        setLikeInFlight((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      }
    },
    [user, likeInFlight, postId]
  );

  return {
    comments,
    isLoading,
    loadError,
    likedCommentIds,
    hasMore,
    loadingMore,
    loadMore,
    addComment,
    editComment,
    deleteComment,
    toggleLike,
  };
}
