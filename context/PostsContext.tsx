/**
 * PostsContext
 * Real-time posts feed from Firestore via onSnapshot.
 * Mutations go through postsService; the listener auto-reflects all changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Post } from "../types/Post";
import {
  createPost as persistCreate,
  editPost as persistEdit,
  deletePost as persistDelete,
  addComment as persistAddComment,
  editComment as persistEditComment,
  deleteComment as persistDeleteComment,
  likePost as persistLike,
} from "../services/postsService";
import { useProfile } from "./ProfileContext";
import { useAuth } from "./AuthContext";
import { db } from "../lib/firebase";

type PostsContextType = {
  posts: Post[];
  isLoading: boolean;
  createPost: (title: string, body: string, tags: string[], imageUrl?: string) => Promise<void>;
  editPost: (id: string, title: string, body: string, tags: string[], imageUrl?: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  addComment: (postId: string, content: string) => Promise<void>;
  editComment: (postId: string, commentId: string, content: string) => Promise<void>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  likePost: (postId: string) => Promise<void>;
};

const PostsContext = createContext<PostsContextType | undefined>(undefined);

export function PostsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Post[];
        setPosts(loaded);
        setIsLoading(false);
      },
      (error) => {
        // Without this, a connectivity failure would leave isLoading stuck
        // true forever (the success callback would simply never fire).
        if (__DEV__) console.warn("[PostsContext] posts listener error", error);
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const createPost = useCallback(
    async (title: string, body: string, tags: string[], imageUrl: string = "") => {
      await persistCreate(title, body, profile.username, tags, imageUrl);
    },
    [profile.username]
  );

  const editPost = useCallback(async (id: string, title: string, body: string, tags: string[], imageUrl: string = "") => {
    await persistEdit(id, title, body, tags, imageUrl);
  }, []);

  const deletePost = useCallback(async (id: string) => {
    await persistDelete(id);
  }, []);

  const addComment = useCallback(
    async (postId: string, content: string) => {
      await persistAddComment(postId, profile.username, content);
    },
    [profile.username]
  );

  const editComment = useCallback(async (postId: string, commentId: string, content: string) => {
    await persistEditComment(postId, commentId, content);
  }, []);

  const deleteComment = useCallback(async (postId: string, commentId: string) => {
    await persistDeleteComment(postId, commentId);
  }, []);

  const likePost = useCallback(
    async (postId: string) => {
      await persistLike(postId, profile.username);
    },
    [profile.username]
  );

  const value = useMemo(
    () => ({ posts, isLoading, createPost, editPost, deletePost, addComment, editComment, deleteComment, likePost }),
    [posts, isLoading, createPost, editPost, deletePost, addComment, editComment, deleteComment, likePost]
  );

  return <PostsContext.Provider value={value}>{children}</PostsContext.Provider>;
}

export function usePosts() {
  const ctx = useContext(PostsContext);
  if (!ctx) throw new Error("usePosts must be used inside PostsProvider");
  return ctx;
}
