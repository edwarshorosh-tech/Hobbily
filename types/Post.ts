/**
 * Post & Comment type definitions
 * These types mirror the data stored in AsyncStorage and will map directly to
 * Appwrite collection attributes when the backend is integrated in Phase 2.
 */

/** A single comment attached to a post */
export type Comment = {
  /** Unique ID (Date.now().toString() locally; Appwrite $id in production) */
  id: string;
  /** ID of the parent post this comment belongs to */
  postId: string;
  /** Username of the commenter, captured from ProfileContext at posting time */
  username: string;
  content: string;
  createdAt: string;  // ISO 8601
  /** Set when the comment is edited — drives the "✎ edited" badge */
  editedAt?: string;  // ISO 8601
  /** Set on soft-delete — comment renders as a "deleted" placeholder, preserving thread structure */
  deletedAt?: string; // ISO 8601
};

/** A community post created by a user */
export type Post = {
  /** Unique ID (Date.now().toString() locally; Appwrite $id in production) */
  id: string;
  title: string;
  body: string;
  /** Username of the author, captured from ProfileContext at posting time */
  username: string;
  /** Topic/hobby tags added when creating or editing the post */
  tags: string[];
  /** Download URL of an attached photo, or "" if the post has none. Absent on posts created before this field existed. */
  imageUrl?: string;
  createdAt: string;  // ISO 8601
  /** Set when the post is edited — drives the "✎ edited" badge in the UI */
  editedAt?: string;  // ISO 8601
  /** All comments for this post — stored inline for simplicity */
  comments: Comment[];
  /** Usernames of users who have liked this post — enforces one like per user */
  likes: string[];
};
