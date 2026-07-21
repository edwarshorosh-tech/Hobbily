/**
 * Post & Comment type definitions.
 *
 * Comments and likes used to live as arrays inline on the post document.
 * That made per-comment/per-like ownership impossible to enforce with
 * Firestore security rules (there's no way to say "you may only touch your
 * own array entry" against an arbitrary array), and every comment/like was a
 * read-modify-write of the *entire* array — a race condition where two
 * concurrent comments could silently drop one. Comments and likes now live
 * in their own subcollections (see services/postsService.ts), each item
 * independently ownable and independently indexable.
 */

/** A single comment attached to a post — posts/{postId}/comments/{commentId}. */
export type Comment = {
  id: string;
  /** ID of the parent post this comment belongs to. */
  postId: string;
  /** UID of the commenter — the real ownership key (see firestore.rules). */
  authorId: string;
  /** Username of the commenter, captured at posting time for display. */
  username: string;
  /** ID of the comment this is a reply to, or null for a top-level comment. Only one level of nesting is displayed (see app/post/[id].tsx). */
  parentCommentId: string | null;
  content: string;
  createdAt: string; // ISO 8601
  /** Set when the comment is edited — drives the "✎ edited" badge. */
  editedAt?: string; // ISO 8601
  /** Set on soft-delete — comment renders as a "deleted" placeholder, preserving thread structure. */
  deletedAt?: string; // ISO 8601
  /** Denormalized count, kept in sync via services/postsService.toggleCommentLike. */
  likeCount: number;
};

/** A community post created by a user — posts/{postId}. */
export type Post = {
  id: string;
  /** UID of the author — the real ownership key (see firestore.rules). */
  authorId: string;
  title: string;
  body: string;
  /** Username of the author, captured at posting time for display. */
  username: string;
  /** Topic/hobby tags added when creating or editing the post. */
  tags: string[];
  /** Download URL of an attached photo, or "" if the post has none. Absent on posts created before this field existed. */
  imageUrl?: string;
  createdAt: string; // ISO 8601
  /** Set when the post is edited — drives the "✎ edited" badge in the UI. */
  editedAt?: string; // ISO 8601
  /** Denormalized counts, kept in sync via services/postsService (transactions, never trusted from a raw client write of an arbitrary number — see firestore.rules). */
  likeCount: number;
  commentCount: number;
};
