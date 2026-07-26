/**
 * CommunityContext
 * Channels are predefined. Messages live in Firestore under
 * channels/{channelId}/messages/{messageId} with real-time listeners.
 * Membership (which channels the current user has joined) is a real
 * Firestore record — communityMemberships/{channelId}_{uid} — not a
 * device-local AsyncStorage list, so it survives reinstalls, works across
 * devices, and can't silently drift from what the server actually allows
 * (see services/communityService.ts).
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  collection, doc, addDoc, deleteDoc, query, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { Channel, CommunityMessage, ReplyPreview } from "../types/CommunityMessage";
import { useAuth } from "./AuthContext";
import { useProfile } from "./ProfileContext";
import { db } from "../lib/firebase";
import {
  joinChannel as persistJoin,
  leaveChannel as persistLeave,
  subscribeToMyMemberships,
  fetchMemberCounts,
} from "../services/communityService";
import { checkText, ModerationBlockedError, shouldLogModerationEvent } from "../services/moderationService";
import { recordModerationEvent } from "../services/moderationEventService";

/** Matches firestore.rules' own text/caption size cap (channels/{id}/messages' text.size()<=2000) — checked client-side first so a too-long message shows a clear length reason instead of a generic "couldn't send" once it hits the server. */
export const MAX_MESSAGE_LENGTH = 2000;

export class CommunityMessageTooLongError extends Error {
  constructor() {
    super(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
    this.name = "CommunityMessageTooLongError";
  }
}

export const DEFAULT_CHANNELS: Channel[] = [
  { id: "photography", name: "Photography", icon: "camera-outline", description: "Share shots, tips, and camera gear" },
  { id: "music", name: "Music", icon: "musical-notes-outline", description: "Instruments, playlists, and gigs" },
  { id: "drawing", name: "Drawing & Art", icon: "color-palette-outline", description: "Sketches, paintings, and digital art" },
  { id: "coding", name: "Coding", icon: "code-slash-outline", description: "Projects, tutorials, and coding challenges" },
  { id: "sports", name: "Sports", icon: "football-outline", description: "Football, basketball, running, and more" },
  { id: "cooking", name: "Cooking", icon: "restaurant-outline", description: "Recipes, food hacks, and kitchen tips" },
  { id: "gaming", name: "Gaming", icon: "game-controller-outline", description: "Reviews, strategies, and game nights" },
  { id: "reading", name: "Reading", icon: "book-outline", description: "Book recs, reviews, and reading clubs" },
  { id: "dance", name: "Dance", icon: "walk-outline", description: "Styles, videos, and local workshops" },
  { id: "film", name: "Film & Video", icon: "videocam-outline", description: "Short films, reviews, and editing tips" },
];

export type JoinChannelResult = { ok: true } | { ok: false; message: string };

export type SendMessagePayload = (
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string; imageStoragePath: string; caption?: string }
  | { type: "sticker"; stickerId: string }
) & {
  /** The message being replied to — its id (the canonical relation) plus a denormalized preview for display. Omitted for a non-reply send. */
  replyTo?: { messageId: string; preview: ReplyPreview };
};

type CommunityContextType = {
  channels: Channel[];
  messages: Record<string, CommunityMessage[]>;
  joinedChannelIds: string[];
  /** Real per-channel joined-member counts — fetched from Firestore, refreshed after every join/leave. Absent key = not yet loaded. */
  memberCounts: Record<string, number>;
  /** True until the current user's own membership list has loaded from Firestore. */
  isLoading: boolean;
  /** channelIds with a join/leave currently in flight — used to disable the button and prevent a double-tap from firing twice. */
  pendingChannelIds: Set<string>;
  joinChannel: (id: string) => Promise<JoinChannelResult>;
  leaveChannel: (id: string) => Promise<JoinChannelResult>;
  sendMessage: (channelId: string, payload: SendMessagePayload) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
};

const CommunityContext = createContext<CommunityContextType | undefined>(undefined);

function friendlyMessage(e: unknown): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "permission-denied") return "You don't have permission to do that.";
  if (code === "network-error") return "Network error — please check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [messages, setMessages] = useState<Record<string, CommunityMessage[]>>({});
  const [joinedChannelIds, setJoinedChannelIds] = useState<string[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pendingChannelIds, setPendingChannelIds] = useState<Set<string>>(new Set());
  // Track active Firestore message listeners so we can tear them down
  const channelUnsubs = useRef<Record<string, () => void>>({});

  const refreshMemberCounts = useCallback(async () => {
    try {
      const counts = await fetchMemberCounts(DEFAULT_CHANNELS.map((c) => c.id));
      setMemberCounts(counts);
    } catch (e) {
      if (__DEV__) console.warn("[CommunityContext] member count refresh failed", e);
    }
  }, []);

  useEffect(() => {
    refreshMemberCounts();
  }, [refreshMemberCounts]);

  // Subscribe to the current user's own membership records — this is the
  // real, server-verified "which channels am I in" list.
  useEffect(() => {
    if (!user) {
      setJoinedChannelIds([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsub = subscribeToMyMemberships(
      user.uid,
      (memberships) => {
        setJoinedChannelIds(memberships.map((m) => m.channelId));
        setIsLoading(false);
      },
      (e) => {
        if (__DEV__) console.warn("[CommunityContext] membership listener error", e);
        setIsLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // Subscribe to Firestore messages for all joined channels whenever they change.
  // When user signs out, tear down all active listeners to prevent memory leaks
  // and stop cross-user data arriving in state.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Signed out — remove all active listeners and clear cached messages
      Object.values(channelUnsubs.current).forEach((u) => u());
      channelUnsubs.current = {};
      setMessages({});
      return;
    }

    // Subscribe to any channel not yet subscribed
    joinedChannelIds.forEach((channelId) => {
      if (channelUnsubs.current[channelId]) return;
      const q = query(
        collection(db, "channels", channelId, "messages"),
        orderBy("createdAt", "asc"),
        limit(200)
      );
      // includeMetadataChanges + hasPendingWrites is the real "sending..."
      // signal (Firestore's own local-write-not-yet-acked flag) — not a
      // second, hand-rolled optimistic-message system that could drift from
      // what's actually saved.
      channelUnsubs.current[channelId] = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites })) as CommunityMessage[];
          setMessages((prev) => {
            // includeMetadataChanges is real and load-bearing (it's how the
            // "sending..." indicator is derived from hasPendingWrites — see
            // the comment above), so it can't just be dropped to cut
            // re-renders. But every fired snapshot — including ones where
            // nothing user-visible actually changed (e.g. a cache→server
            // metadata flip on an already-fully-synced channel) — rebuilt a
            // brand-new array and pushed a new CommunityContext value,
            // re-rendering every useCommunity() consumer app-wide even while
            // the user was on a completely different tab (this provider is
            // mounted at the app root, not scoped to the Community tab).
            // Messages here are immutable once created (no edit feature —
            // firestore.rules never allows updating one), so `id` + `pending`
            // is a cheap, sufficient fingerprint for "did anything visible
            // actually change" — skip the state update entirely when it
            // didn't, rather than pushing an identical array by reference.
            const previous = prev[channelId];
            const unchanged =
              previous &&
              previous.length === msgs.length &&
              previous.every((m, i) => m.id === msgs[i].id && m.pending === msgs[i].pending);
            if (unchanged) return prev;
            return { ...prev, [channelId]: msgs };
          });
        },
        (error) => {
          if (__DEV__) console.warn(`[CommunityContext] messages listener error (${channelId})`, error);
        }
      );
    });

    // Tear down listeners for channels the user has left since the last run.
    Object.keys(channelUnsubs.current).forEach((channelId) => {
      if (!joinedChannelIds.includes(channelId)) {
        channelUnsubs.current[channelId]();
        delete channelUnsubs.current[channelId];
        setMessages((prev) => {
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    });
  }, [joinedChannelIds, isLoading, user]);

  useEffect(() => {
    return () => {
      Object.values(channelUnsubs.current).forEach((u) => u());
    };
  }, []);

  async function withPendingGuard(id: string, action: () => Promise<void>): Promise<JoinChannelResult> {
    if (!user) return { ok: false, message: "Please sign in again." };
    if (pendingChannelIds.has(id)) return { ok: false, message: "Already in progress." };
    setPendingChannelIds((prev) => new Set(prev).add(id));
    try {
      await action();
      refreshMemberCounts();
      return { ok: true };
    } catch (e) {
      if (__DEV__) console.warn("[CommunityContext] channel action failed", e);
      return { ok: false, message: friendlyMessage(e) };
    } finally {
      setPendingChannelIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function joinChannel(id: string): Promise<JoinChannelResult> {
    if (joinedChannelIds.includes(id)) return { ok: true }; // already joined — idempotent no-op, not an error
    return withPendingGuard(id, () => persistJoin(id, user!.uid, profile.username || "explorer"));
  }

  async function leaveChannel(id: string): Promise<JoinChannelResult> {
    if (!joinedChannelIds.includes(id)) return { ok: true };
    return withPendingGuard(id, () => persistLeave(id, user!.uid));
  }

  async function sendMessage(channelId: string, payload: SendMessagePayload) {
    if (!user) return;
    // firestore.rules caps text/caption at 2000 chars server-side but the
    // composer had no client-side cap at all — a too-long message used to
    // just fail with a generic "couldn't send" once it hit the server,
    // never telling the user why. Checked before the moderation check so a
    // too-long message shows the length reason, not a misleading content one.
    const textToCheck = payload.type === "text" ? payload.text : payload.type === "image" ? payload.caption ?? "" : "";
    if (textToCheck.length > MAX_MESSAGE_LENGTH) {
      throw new CommunityMessageTooLongError();
    }
    if (textToCheck.trim()) {
      const check = checkText(textToCheck);
      if (!check.allowed) {
        if (shouldLogModerationEvent(check.severity)) {
          recordModerationEvent({ userId: user.uid, surface: "community_message", entityId: channelId, category: check.category, severity: check.severity });
        }
        throw new ModerationBlockedError(check.category, check.severity);
      }
    }
    const base = {
      channelId,
      authorId: user.uid,
      author: profile.username || "You",
      createdAt: new Date().toISOString(),
      ...(payload.replyTo ? { replyToMessageId: payload.replyTo.messageId, replyPreview: payload.replyTo.preview } : {}),
    };
    const doc =
      payload.type === "text"
        ? { ...base, type: "text" as const, text: payload.text }
        : payload.type === "image"
        ? { ...base, type: "image" as const, text: payload.caption ?? "", imageUrl: payload.imageUrl, imageStoragePath: payload.imageStoragePath }
        : { ...base, type: "sticker" as const, text: "", stickerId: payload.stickerId };
    await addDoc(collection(db, "channels", channelId, "messages"), doc);
    // Real-time listener updates state automatically
  }

  async function deleteMessage(channelId: string, messageId: string) {
    await deleteDoc(doc(db, "channels", channelId, "messages", messageId));
  }

  const value = useMemo(
    () => ({
      channels: DEFAULT_CHANNELS,
      messages,
      joinedChannelIds,
      memberCounts,
      isLoading,
      pendingChannelIds,
      joinChannel,
      leaveChannel,
      sendMessage,
      deleteMessage,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, joinedChannelIds, memberCounts, isLoading, pendingChannelIds]
  );

  return (
    <CommunityContext.Provider value={value}>
      {children}
    </CommunityContext.Provider>
  );
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunity must be used inside CommunityProvider");
  return ctx;
}
