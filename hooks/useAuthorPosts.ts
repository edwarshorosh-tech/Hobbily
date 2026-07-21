/**
 * useAuthorPosts — one author's own posts, for Profile's Posts tab.
 *
 * Fetches every post by the author in one live listener (see
 * services/postsService.ts's subscribeToPostsByAuthor for why this
 * deliberately avoids a Firestore-side orderBy), sorts newest-first
 * client-side, and paginates by simply revealing more of that already-
 * fetched, already-sorted array — no separate Firestore page fetches, no
 * merge/dedup logic needed, since there is only ever one data source.
 */
import { useCallback, useEffect, useState } from "react";
import { Post } from "../types/Post";
import { POSTS_PAGE_SIZE, subscribeToPostsByAuthor, PostsServiceError } from "../services/postsService";
import { sortByCreatedAtDesc } from "../utils/pagination";

function friendlyMessage(e: PostsServiceError): string {
  // A missing-index failure isn't a connectivity problem, and re-checking
  // "your connection" can't fix it — show the message postsService already
  // produced for this specific case instead of a misleading generic one.
  if (e.code === "missing-index") return e.message;
  return "Couldn't load your posts. Please check your connection and try again.";
}

export function useAuthorPosts(authorId: string | null) {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(POSTS_PAGE_SIZE);

  useEffect(() => {
    if (!authorId) {
      setAllPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setVisibleCount(POSTS_PAGE_SIZE);
    const unsub = subscribeToPostsByAuthor(
      authorId,
      (fetched) => {
        setAllPosts(sortByCreatedAtDesc(fetched));
        setIsLoading(false);
      },
      (e: PostsServiceError) => {
        if (__DEV__) console.warn("[useAuthorPosts] listener error", e);
        setLoadError(friendlyMessage(e));
        setIsLoading(false);
      }
    );
    return unsub;
  }, [authorId]);

  const posts = allPosts.slice(0, visibleCount);
  const hasMore = visibleCount < allPosts.length;

  const loadMore = useCallback(() => {
    setVisibleCount((v) => Math.min(v + POSTS_PAGE_SIZE, allPosts.length));
  }, [allPosts.length]);

  return { posts, isLoading, loadError, hasMore, loadingMore: false, loadMore };
}
