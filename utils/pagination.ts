/**
 * Shared pagination merge/hasMore logic for the "live first page + static
 * older pages" pattern used by PostsContext (feed), useAuthorPosts (Profile's
 * Posts tab), and usePostComments (Post Detail). Pulled out as pure functions
 * so all three stay consistent and are independently testable — see
 * __tests__/pagination.test.ts.
 */

export type Identified = { id: string };

/**
 * Combines the realtime "live page" with the already-fetched static older
 * pages, deduping by id (the live page always wins on overlap, since it's
 * the freshest data for whichever items it contains).
 */
export function mergePages<T extends Identified>(
  livePage: T[],
  olderItems: T[],
  olderPosition: "before" | "after"
): T[] {
  const seen = new Set(livePage.map((item) => item.id));
  const dedupedOlder = olderItems.filter((item) => !seen.has(item.id));
  return olderPosition === "before" ? [...dedupedOlder, ...livePage] : [...livePage, ...dedupedOlder];
}

/**
 * Whether "load more" should still be offered after a realtime update to the
 * live page. The live listener only ever observes the newest page — once
 * older pages have already been paginated in, a live update carries no
 * information about whether the true tail has more items, so it must leave
 * hasMore exactly as it was rather than forcing it back to false just
 * because this particular live snapshot happened to be shorter than a full
 * page (e.g. right after the very newest item was added).
 */
/** Newest-first sort by an ISO createdAt string — does not mutate the input array. */
export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function nextHasMoreAfterLiveUpdate(
  livePageLength: number,
  pageSize: number,
  olderItemsCount: number,
  previousHasMore: boolean
): boolean {
  if (olderItemsCount > 0) return previousHasMore;
  return livePageLength === pageSize;
}
