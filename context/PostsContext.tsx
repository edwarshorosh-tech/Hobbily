/**
 * PostsContext
 * Real-time posts feed from Firestore via onSnapshot, plus the current
 * user's liked-post set (see services/postsService.ts for why that's its
 * own listener rather than a field on each post). Comments are NOT loaded
 * here — they're a per-post subcollection, only ever subscribed to while
 * that post's detail screen is open (see hooks/usePostComments.ts) — so
 * opening the feed never pulls every comment on every post over the wire.
 *
 * Pagination: the live listener always represents the newest
 * POSTS_PAGE_SIZE posts (so likes/edits/new posts stay realtime); loadMore
 * fetches older pages as a one-time (non-live) tail, the same pattern
 * hooks/usePostComments.ts uses for a post's comments.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Post } from "../types/Post";
import {
  POSTS_PAGE_SIZE,
  createPost as persistCreate,
  editPost as persistEdit,
  deletePost as persistDelete,
  fetchMorePosts,
  togglePostLike,
  subscribeToLikedPostIds,
} from "../services/postsService";
import { useProfile } from "./ProfileContext";
import { useAuth } from "./AuthContext";
import { db } from "../lib/firebase";
import { mergePages, nextHasMoreAfterLiveUpdate } from "../utils/pagination";

type PostsContextType = {
  posts: Post[];
  isLoading: boolean;
  loadError: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** postIds the current user has liked — empty set when signed out. */
  likedPostIds: Set<string>;
  createPost: (title: string, body: string, tags: string[], imageUrl?: string) => Promise<void>;
  editPost: (id: string, title: string, body: string, tags: string[], imageUrl?: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  /** Toggles the current user's like on a post. Guards itself against overlapping calls for the same post (see `likeInFlight`) so a double-tap can't race the same toggle twice. */
  toggleLike: (postId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  /** Re-establishes the live listener from scratch — used for pull-to-refresh and "Retry" after a load error. */
  refresh: () => void;
};

const PostsContext = createContext<PostsContextType | undefined>(undefined);

function friendlyLoadError(): string {
  return "Couldn't load posts. Please check your connection and try again.";
}

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likeInFlight, setLikeInFlight] = useState<Set<string>>(new Set());
  const [retryTick, setRetryTick] = useState(0);
  const olderPosts = useRef<Post[]>([]);

  useEffect(() => {
    if (!user) {
      setPosts([]);
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    olderPosts.current = [];
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(POSTS_PAGE_SIZE));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const livePage = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Post[];
        setPosts(mergePages(livePage, olderPosts.current, "after"));
        setHasMore((prev) => nextHasMoreAfterLiveUpdate(livePage.length, POSTS_PAGE_SIZE, olderPosts.current.length, prev));
        setIsLoading(false);
        setLoadError(null);
      },
      (error) => {
        // Without this, a connectivity failure would leave isLoading stuck
        // true forever (the success callback would simply never fire).
        if (__DEV__) console.warn("[PostsContext] posts listener error", error);
        setIsLoading(false);
        setLoadError(friendlyLoadError());
      }
    );
    return () => unsub();
  }, [user, retryTick]);

  useEffect(() => {
    if (!user) {
      setLikedPostIds(new Set());
      return;
    }
    return subscribeToLikedPostIds(user.uid, setLikedPostIds, (e) => {
      if (__DEV__) console.warn("[PostsContext] liked-posts listener error", e);
    });
  }, [user]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const nextPage = await fetchMorePosts(posts[posts.length - 1]);
      olderPosts.current = mergePages(olderPosts.current, nextPage, "after");
      setPosts((prev) => mergePages(prev, nextPage, "after"));
      setHasMore(nextPage.length === POSTS_PAGE_SIZE);
    } catch (e) {
      if (__DEV__) console.warn("[PostsContext] loadMore failed", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, posts]);

  const refresh = useCallback(() => {
    olderPosts.current = [];
    setRetryTick((n) => n + 1);
  }, []);

  const createPost = useCallback(
    async (title: string, body: string, tags: string[], imageUrl: string = "") => {
      if (!user) return;
      await persistCreate(user.uid, title, body, profile.username, tags, imageUrl);
    },
    [user, profile.username]
  );

  const editPost = useCallback(async (id: string, title: string, body: string, tags: string[], imageUrl: string = "") => {
    await persistEdit(id, title, body, tags, imageUrl);
  }, []);

  const deletePost = useCallback(async (id: string) => {
    await persistDelete(id);
  }, []);

  const toggleLike = useCallback(
    async (postId: string) => {
      if (!user || likeInFlight.has(postId)) return;
      setLikeInFlight((prev) => new Set(prev).add(postId));
      try {
        await togglePostLike(postId, user.uid);
        // No optimistic local mutation of `likedPostIds` here — the
        // subscribeToLikedPostIds listener above reflects the transaction's
        // result within a frame, which is fast enough not to need a
        // separate optimistic/rollback path for this specific action.
      } finally {
        setLikeInFlight((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      }
    },
    [user, likeInFlight]
  );

  const value = useMemo(
    () => ({ posts, isLoading, loadError, hasMore, loadingMore, likedPostIds, createPost, editPost, deletePost, toggleLike, loadMore, refresh }),
    [posts, isLoading, loadError, hasMore, loadingMore, likedPostIds, createPost, editPost, deletePost, toggleLike, loadMore, refresh]
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const ctx = useContext(PostsContext);
  if (!ctx) throw new Error("usePosts must be used inside PostsProvider");
  return ctx;
}
