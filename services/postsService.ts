/**
 * postsService — all Firestore I/O for posts, comments, and likes.
 *
 * Collection layout:
 *   posts/{postId}
 *   posts/{postId}/comments/{commentId}
 *   users/{uid}/likedPostIds/{postId}     — existence = this user likes this post
 *   users/{uid}/likedCommentIds/{commentId} — existence = this user likes this comment
 *
 * The liked-id mirrors under users/{uid}/... (rather than a
 * posts/{postId}/likes/{uid} subcollection) mean "which posts/comments has
 * the current user liked" is one plain collection listener scoped to their
 * own uid — the same shape already used by users/{uid}/notifications
 * elsewhere in this app — instead of a Firestore collectionGroup query,
 * which would need an extra collection-group index deployed before it could
 * run at all. likeCount/commentCount on the post (and likeCount on each
 * comment) are denormalized counters, updated atomically in the same
 * transaction as the like/comment write; firestore.rules independently
 * verifies each counter can only move by exactly 1 and only alongside the
 * matching like doc actually being created/removed in that same
 * transaction (via existsAfter) — see the rules file for the exact check.
 */
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  runTransaction,
  increment,
  QueryDocumentSnapshot,
  DocumentData,
  Unsubscribe,
} from "firebase/firestore";
import { Post, Comment } from "../types/Post";
import { deletePostImage } from "./storageService";
import { mapFirebaseError, rawErrorCode } from "./firebaseErrors";

const POSTS = "posts";
export const COMMENTS_PAGE_SIZE = 30;
export const POSTS_PAGE_SIZE = 15;

export type PostsServiceErrorCode = "not-found" | "permission-denied" | "network-error" | "missing-index" | "unknown";

export class PostsServiceError extends Error {
  code: PostsServiceErrorCode;
  constructor(code: PostsServiceErrorCode, message: string) {
    super(message);
    this.name = "PostsServiceError";
    this.code = code;
  }
}

/**
 * Firestore's composite-index queries (posts by author, ordered by
 * createdAt) fail with FirebaseError code "failed-precondition" and a
 * message containing a console URL to create the missing index — a totally
 * different failure mode from "permission-denied"/"network-error", and not
 * something a Retry button can ever fix on its own. Detected and reported
 * separately here (rather than folding into mapFirebaseError's generic
 * "unknown" bucket) so a developer sees exactly what's wrong and where to
 * fix it, instead of a vague "Something went wrong."
 */
function isMissingIndexError(e: unknown): boolean {
  return rawErrorCode(e) === "failed-precondition" && e instanceof Error && /requires an index/i.test(e.message);
}

function mapError(e: unknown): PostsServiceError {
  if (e instanceof PostsServiceError) return e;
  if (isMissingIndexError(e)) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        "[postsService] Firestore composite index missing for this query — it must be created (Firebase Console) or deployed " +
          "(`firebase deploy --only firestore:indexes`) before this query can run, and reach status \"Enabled\" (not just " +
          "\"Building\"). Full Firestore error, including the create-index URL:",
        (e as Error).message
      );
    }
    return new PostsServiceError(
      "missing-index",
      "This is taking a little longer to set up on our end. Please try again shortly."
    );
  }
  const { code, message } = mapFirebaseError(e, "postsService");
  return new PostsServiceError(code, message);
}

function commentsCollection(postId: string) {
  return collection(db, POSTS, postId, "comments");
}
function likedPostRef(uid: string, postId: string) {
  return doc(db, "users", uid, "likedPostIds", postId);
}
function likedCommentRef(uid: string, commentId: string) {
  return doc(db, "users", uid, "likedCommentIds", commentId);
}

// ── Posts ──────────────────────────────────────────────────────────────────────

export async function createPost(
  authorId: string,
  title: string,
  body: string,
  username: string,
  tags: string[],
  imageUrl: string
): Promise<Post> {
  try {
    const data = {
      authorId,
      title,
      body,
      username,
      tags,
      imageUrl,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
    };
    const ref = await addDoc(collection(db, POSTS), data);
    return { ...data, id: ref.id };
  } catch (e) {
    throw mapError(e);
  }
}

export async function editPost(
  id: string,
  title: string,
  body: string,
  tags: string[],
  imageUrl: string
): Promise<void> {
  try {
    await updateDoc(doc(db, POSTS, id), { title, body, tags, imageUrl, editedAt: new Date().toISOString() });
  } catch (e) {
    throw mapError(e);
  }
}

export async function deletePost(id: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, POSTS, id));
    const imageUrl = snap.exists() ? (snap.data().imageUrl as string | undefined) : undefined;
    await deleteDoc(doc(db, POSTS, id));
    // Best-effort — an orphaned Storage file is a minor cost, but failing the
    // whole delete over Storage cleanup would be a worse trade. Comment/like
    // subcollection docs are left behind (Firestore never cascade-deletes
    // subcollections); they're inert once the parent is gone and are simply
    // never read again through any query this app makes.
    if (imageUrl) await deletePostImage(imageUrl).catch(() => {});
  } catch (e) {
    throw mapError(e);
  }
}

/** Fetches the next older page of posts, one-time (not live) — appended by the caller after the live first page. Mirrors fetchMoreComments' pattern: the feed's first page stays realtime via subscribeToPosts's onSnapshot; older pages are a static tail. */
export async function fetchMorePosts(after: Post): Promise<Post[]> {
  try {
    const q = query(collection(db, POSTS), orderBy("createdAt", "desc"), startAfter(after.createdAt), limit(POSTS_PAGE_SIZE));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post);
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * Every post by one author, for Profile's Posts tab. Deliberately does NOT
 * combine `where("authorId", "==", authorId)` with `orderBy("createdAt")` in
 * the same Firestore query — that combination needs an explicit composite
 * index, which this project cannot currently deploy from its CI/dev setup
 * (no authenticated Firebase CLI session here), and a query against a
 * not-yet-Enabled index fails outright with "failed-precondition: The query
 * requires an index" every time, which is exactly the bug this replaces.
 *
 * `where("authorId", "==", authorId)` alone only touches `authorId`'s
 * automatic single-field index (Firestore always maintains one per field,
 * no deployment needed), so this works unconditionally. The cap below is
 * generous for a personal hobby-tracking profile's realistic post count;
 * sorting/windowing happens client-side in useAuthorPosts. If profiles ever
 * routinely exceed the cap, switch back to the composite-indexed query once
 * it's actually deployed and Enabled (see firestore.indexes.json history).
 */
const AUTHOR_POSTS_FETCH_CAP = 300;

/**
 * Live-subscribes to one author's own posts (unsorted from Firestore's
 * side — see AUTHOR_POSTS_FETCH_CAP above) — used by Profile's Posts tab.
 * Independent of the main feed's pagination cursor (filtering the feed's
 * already-loaded posts by author would only ever show whichever of a user's
 * posts happened to already be paged into the feed).
 */
export function subscribeToPostsByAuthor(
  authorId: string,
  onChange: (posts: Post[]) => void,
  onError?: (e: PostsServiceError) => void
): Unsubscribe {
  const q = query(collection(db, POSTS), where("authorId", "==", authorId), limit(AUTHOR_POSTS_FETCH_CAP));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Post)),
    (err) => onError?.(mapError(err))
  );
}

/**
 * Live-subscribes to a single post by id — used by Post Detail as the
 * authoritative source of truth, regardless of whether the post happens to
 * be in the feed's already-loaded pages. The feed's shared `posts` array only
 * keeps page 1 realtime (older pages are a static, one-time tail — see
 * fetchMorePosts above), so a post reached via a deep link, a stale page, or
 * before the feed has ever been opened this session would otherwise show a
 * false "Post not found," and its like/comment counts wouldn't reliably
 * stay live. A single extra listener for the one post being viewed on this
 * screen is the right trade — not "one listener per visible card."
 */
export function subscribeToPost(
  postId: string,
  onChange: (post: Post | null) => void,
  onError?: (e: PostsServiceError) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, POSTS, postId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Post) : null),
    (err) => onError?.(mapError(err))
  );
}

/** Toggles the current user's like on a post. Returns the new liked state. Idempotent against rapid double-taps — a transaction re-reads the like doc's existence first, so two near-simultaneous calls can't both "add" or both "remove". */
export async function togglePostLike(postId: string, uid: string): Promise<boolean> {
  const postRef = doc(db, POSTS, postId);
  const likeRef = likedPostRef(uid, postId);
  try {
    return await runTransaction(db, async (tx) => {
      const [postSnap, likeSnap] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
      if (!postSnap.exists()) throw new PostsServiceError("not-found", "This post no longer exists.");
      if (likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(postRef, { likeCount: increment(-1) });
        return false;
      }
      tx.set(likeRef, { postId, createdAt: new Date().toISOString() });
      tx.update(postRef, { likeCount: increment(1) });
      return true;
    });
  } catch (e) {
    throw mapError(e);
  }
}

/** One-time fetch of every postId the given user has liked — used to seed "am I liking this" state for the feed. */
export async function fetchLikedPostIds(uid: string): Promise<Set<string>> {
  try {
    const snap = await getDocs(collection(db, "users", uid, "likedPostIds"));
    return new Set(snap.docs.map((d) => d.id));
  } catch (e) {
    throw mapError(e);
  }
}

/** Live-subscribes to every postId the given user has liked. */
export function subscribeToLikedPostIds(uid: string, onChange: (ids: Set<string>) => void, onError?: (e: PostsServiceError) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "users", uid, "likedPostIds"),
    (snap) => onChange(new Set(snap.docs.map((d) => d.id))),
    (err) => onError?.(mapError(err))
  );
}

// ── Comments ───────────────────────────────────────────────────────────────────

function toComment(d: QueryDocumentSnapshot<DocumentData>): Comment {
  return { id: d.id, ...(d.data() as Omit<Comment, "id">) };
}

/** Live-subscribes to the first page of a post's comments, oldest first. Call fetchMoreComments for subsequent pages. */
export function subscribeToComments(
  postId: string,
  onChange: (comments: Comment[]) => void,
  onError?: (e: PostsServiceError) => void
): Unsubscribe {
  const q = query(commentsCollection(postId), orderBy("createdAt", "asc"), limit(COMMENTS_PAGE_SIZE));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(toComment)),
    (err) => onError?.(mapError(err))
  );
}

/** Fetches the next page of older-than-`after`... actually newer-than-`after` (ascending order) comments — a one-time, non-live fetch, appended by the caller. */
export async function fetchMoreComments(postId: string, after: Comment): Promise<Comment[]> {
  try {
    const q = query(
      commentsCollection(postId),
      orderBy("createdAt", "asc"),
      startAfter(after.createdAt),
      limit(COMMENTS_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    return snap.docs.map(toComment);
  } catch (e) {
    throw mapError(e);
  }
}

export async function addComment(
  postId: string,
  authorId: string,
  username: string,
  content: string,
  parentCommentId: string | null = null
): Promise<Comment> {
  const postRef = doc(db, POSTS, postId);
  const commentRef = doc(commentsCollection(postId));
  const data = {
    postId,
    authorId,
    username,
    parentCommentId,
    content,
    createdAt: new Date().toISOString(),
    likeCount: 0,
  };
  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new PostsServiceError("not-found", "This post no longer exists.");
      tx.set(commentRef, data);
      tx.update(postRef, { commentCount: increment(1) });
    });
    return { ...data, id: commentRef.id };
  } catch (e) {
    throw mapError(e);
  }
}

export async function editComment(postId: string, commentId: string, content: string): Promise<void> {
  try {
    await updateDoc(doc(db, POSTS, postId, "comments", commentId), { content, editedAt: new Date().toISOString() });
  } catch (e) {
    throw mapError(e);
  }
}

/** Soft-deletes a comment (preserves thread structure for any replies) and decrements the post's visible comment count. Idempotent — deleting an already-deleted comment is a no-op. */
export async function deleteComment(postId: string, commentId: string): Promise<void> {
  const postRef = doc(db, POSTS, postId);
  const commentRef = doc(db, POSTS, postId, "comments", commentId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(commentRef);
      if (!snap.exists()) throw new PostsServiceError("not-found", "This comment no longer exists.");
      if (snap.data().deletedAt) return;
      tx.update(commentRef, { deletedAt: new Date().toISOString() });
      tx.update(postRef, { commentCount: increment(-1) });
    });
  } catch (e) {
    throw mapError(e);
  }
}

/** Toggles the current user's like on a comment. Returns the new liked state. Same idempotent-transaction shape as togglePostLike. */
export async function toggleCommentLike(postId: string, commentId: string, uid: string): Promise<boolean> {
  const commentRef = doc(db, POSTS, postId, "comments", commentId);
  const likeRef = likedCommentRef(uid, commentId);
  try {
    return await runTransaction(db, async (tx) => {
      const [commentSnap, likeSnap] = await Promise.all([tx.get(commentRef), tx.get(likeRef)]);
      if (!commentSnap.exists()) throw new PostsServiceError("not-found", "This comment no longer exists.");
      if (likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(commentRef, { likeCount: increment(-1) });
        return false;
      }
      tx.set(likeRef, { commentId, postId, createdAt: new Date().toISOString() });
      tx.update(commentRef, { likeCount: increment(1) });
      return true;
    });
  } catch (e) {
    throw mapError(e);
  }
}

export function subscribeToLikedCommentIds(uid: string, onChange: (ids: Set<string>) => void, onError?: (e: PostsServiceError) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "users", uid, "likedCommentIds"),
    (snap) => onChange(new Set(snap.docs.map((d) => d.id))),
    (err) => onError?.(mapError(err))
  );
}
