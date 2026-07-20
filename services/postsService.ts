/**
 * postsService — all Firestore I/O for posts.
 * Mutations only: loading is handled via onSnapshot in PostsContext.
 * Collection structure: posts/{postId}  (comments stored inline as array)
 */
import { db } from "../lib/firebase";
import {
  collection, doc, getDoc, addDoc, updateDoc, deleteDoc,
} from "firebase/firestore";
import { Post, Comment } from "../types/Post";
import { deletePostImage } from "./storageService";

const POSTS = "posts";

export async function createPost(
  title: string,
  body: string,
  username: string,
  tags: string[],
  imageUrl: string
): Promise<Post> {
  const data = {
    title, body, username, tags, imageUrl,
    createdAt: new Date().toISOString(),
    comments: [],
    likes: [],
  };
  const ref = await addDoc(collection(db, POSTS), data);
  return { ...data, id: ref.id };
}

export async function editPost(
  id: string,
  title: string,
  body: string,
  tags: string[],
  imageUrl: string
): Promise<void> {
  await updateDoc(doc(db, POSTS, id), { title, body, tags, imageUrl, editedAt: new Date().toISOString() });
}

export async function deletePost(id: string): Promise<void> {
  const snap = await getDoc(doc(db, POSTS, id));
  const imageUrl = snap.exists() ? (snap.data().imageUrl as string | undefined) : undefined;
  await deleteDoc(doc(db, POSTS, id));
  // Best-effort — an orphaned Storage file is a minor cost, but failing the
  // whole delete over Storage cleanup would be a worse trade.
  if (imageUrl) await deletePostImage(imageUrl).catch(() => {});
}

export async function addComment(
  postId: string,
  username: string,
  content: string
): Promise<Comment> {
  const ref = doc(db, POSTS, postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Post not found");

  const newComment: Comment = {
    id: Date.now().toString(),
    postId,
    username,
    content,
    createdAt: new Date().toISOString(),
  };
  const comments: Comment[] = snap.data().comments ?? [];
  await updateDoc(ref, { comments: [...comments, newComment] });
  return newComment;
}

export async function editComment(
  postId: string,
  commentId: string,
  content: string
): Promise<Comment> {
  const ref = doc(db, POSTS, postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Post not found");

  const comments: Comment[] = snap.data().comments ?? [];
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) throw new Error("Comment not found");

  const updated: Comment = { ...comments[idx], content, editedAt: new Date().toISOString() };
  comments[idx] = updated;
  await updateDoc(ref, { comments });
  return updated;
}

export async function deleteComment(
  postId: string,
  commentId: string
): Promise<Comment> {
  const ref = doc(db, POSTS, postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Post not found");

  const comments: Comment[] = snap.data().comments ?? [];
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) throw new Error("Comment not found");

  const updated: Comment = { ...comments[idx], deletedAt: new Date().toISOString() };
  comments[idx] = updated;
  await updateDoc(ref, { comments });
  return updated;
}

export async function likePost(postId: string, username: string): Promise<void> {
  const ref = doc(db, POSTS, postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Post not found");

  const likes: string[] = snap.data().likes ?? [];
  const updated = likes.includes(username)
    ? likes.filter((u) => u !== username)
    : [...likes, username];
  await updateDoc(ref, { likes: updated });
}
