/**
 * CommunityContext
 * Channels are predefined. Messages live in Firestore under
 * channels/{channelId}/messages/{messageId} with real-time listeners.
 * Joined channel list persisted locally in AsyncStorage (device preference).
 */
import { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection, doc, addDoc, deleteDoc, query, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { Channel, CommunityMessage } from "../types/CommunityMessage";
import { useAuth } from "./AuthContext";
import { db } from "../lib/firebase";

const JOINED_KEY = "@hobbily_joined_channels";

export const DEFAULT_CHANNELS: Channel[] = [
  { id: "photography", name: "Photography", icon: "camera-outline", description: "Share shots, tips, and camera gear", members: 142 },
  { id: "music", name: "Music", icon: "musical-notes-outline", description: "Instruments, playlists, and gigs", members: 218 },
  { id: "drawing", name: "Drawing & Art", icon: "color-palette-outline", description: "Sketches, paintings, and digital art", members: 189 },
  { id: "coding", name: "Coding", icon: "code-slash-outline", description: "Projects, tutorials, and coding challenges", members: 97 },
  { id: "sports", name: "Sports", icon: "football-outline", description: "Football, basketball, running, and more", members: 263 },
  { id: "cooking", name: "Cooking", icon: "restaurant-outline", description: "Recipes, food hacks, and kitchen tips", members: 134 },
  { id: "gaming", name: "Gaming", icon: "game-controller-outline", description: "Reviews, strategies, and game nights", members: 301 },
  { id: "reading", name: "Reading", icon: "book-outline", description: "Book recs, reviews, and reading clubs", members: 88 },
  { id: "dance", name: "Dance", icon: "walk-outline", description: "Styles, videos, and local workshops", members: 112 },
  { id: "film", name: "Film & Video", icon: "videocam-outline", description: "Short films, reviews, and editing tips", members: 76 },
];

type CommunityContextType = {
  channels: Channel[];
  messages: Record<string, CommunityMessage[]>;
  joinedChannelIds: string[];
  isLoading: boolean;
  joinChannel: (id: string) => Promise<void>;
  leaveChannel: (id: string) => Promise<void>;
  sendMessage: (channelId: string, author: string, text: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
};

const CommunityContext = createContext<CommunityContextType | undefined>(undefined);

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Record<string, CommunityMessage[]>>({});
  const [joinedChannelIds, setJoinedChannelIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Track active Firestore listeners so we can tear them down
  const channelUnsubs = useRef<Record<string, () => void>>({});

  // Load joined channels from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(JOINED_KEY).then((raw) => {
      setJoinedChannelIds(raw ? JSON.parse(raw) : ["photography", "sports"]);
      setIsLoading(false);
    });
    return () => {
      // Tear down all listeners when context unmounts
      Object.values(channelUnsubs.current).forEach((u) => u());
    };
  }, []);

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
      channelUnsubs.current[channelId] = onSnapshot(
        q,
        (snap) => {
          const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CommunityMessage[];
          setMessages((prev) => ({ ...prev, [channelId]: msgs }));
        },
        (error) => {
          if (__DEV__) console.warn(`[CommunityContext] messages listener error (${channelId})`, error);
        }
      );
    });
  }, [joinedChannelIds, isLoading, user]);

  async function persistJoined(updated: string[]) {
    setJoinedChannelIds(updated);
    await AsyncStorage.setItem(JOINED_KEY, JSON.stringify(updated));
  }

  async function joinChannel(id: string) {
    if (joinedChannelIds.includes(id)) return;
    await persistJoined([...joinedChannelIds, id]);
  }

  async function leaveChannel(id: string) {
    // Tear down listener
    if (channelUnsubs.current[id]) {
      channelUnsubs.current[id]();
      delete channelUnsubs.current[id];
    }
    setMessages((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    await persistJoined(joinedChannelIds.filter((c) => c !== id));
  }

  async function sendMessage(channelId: string, author: string, text: string) {
    await addDoc(collection(db, "channels", channelId, "messages"), {
      channelId,
      author,
      text,
      createdAt: new Date().toISOString(),
    });
    // Real-time listener updates state automatically
  }

  async function deleteMessage(channelId: string, messageId: string) {
    await deleteDoc(doc(db, "channels", channelId, "messages", messageId));
  }

  return (
    <CommunityContext.Provider
      value={{
        channels: DEFAULT_CHANNELS,
        messages,
        joinedChannelIds,
        isLoading,
        joinChannel,
        leaveChannel,
        sendMessage,
        deleteMessage,
      }}
    >
      {children}
    </CommunityContext.Provider>
  );
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunity must be used inside CommunityProvider");
  return ctx;
}
