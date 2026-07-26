/**
 * Community screen
 * Browse hobby channels, join them, and chat with other teens who share
 * the same interests. Messages are stored in Firestore (real-time via
 * onSnapshot). Membership is a real Firestore record — see
 * context/CommunityContext.tsx — not a device-local AsyncStorage list.
 */
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
  Image,
  Modal,
} from "react-native";
import { useState, useRef, useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../context/ThemeContext";
import { useCommunity, MAX_MESSAGE_LENGTH, CommunityMessageTooLongError } from "../../context/CommunityContext";
import { useProfile } from "../../context/ProfileContext";
import { useAuth } from "../../context/AuthContext";
import SwipeableTab from "../../components/SwipeableTab";
import TipBanner, { TIP_KEYS } from "../../components/TipBanner";
import UserCardSheet from "../../components/user-card/UserCardSheet";
import FriendAvatar from "../../components/friends/FriendAvatar";
import BottomSheet from "../../components/BottomSheet";
import { useAuthorProfiles } from "../../hooks/useAuthorProfiles";
import { Channel, CommunityMessage, CommunityMembership, CommunityMessageType } from "../../types/CommunityMessage";
import { uploadChannelImage, AvatarServiceError, avatarErrorMessage } from "../../services/storageService";
import { STICKER_PACK, QUICK_EMOJI, stickerById } from "../../utils/stickers";
import { subscribeToChannelMembers, subscribeToChannelMessages } from "../../services/communityService";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";
import InlinePageDisclaimer from "../../components/disclaimers/InlinePageDisclaimer";
import { ModerationBlockedError, moderationErrorMessage } from "../../services/moderationService";

// Stable reference for "no messages yet" so useMemo below it doesn't see a
// new array on every render when messages[channel.id] is undefined.
const EMPTY_MESSAGES: CommunityMessage[] = [];

// ── Channel Card ──────────────────────────────────────────────────────────────

type ChannelCardProps = {
  channel: Channel;
  isJoined: boolean;
  memberCount: number | undefined;
  pending: boolean;
  lastMessage?: CommunityMessage;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
  onJoinToggle: () => void;
};

function ChannelCard({ channel, isJoined, memberCount, pending, lastMessage, colors, onPress, onJoinToggle }: ChannelCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.channelIcon, { backgroundColor: colors.primary + "18" }]}>
        <Ionicons name={channel.icon as any} size={22} color={colors.primary} />
      </View>
      <View style={styles.channelInfo}>
        <View style={styles.channelTop}>
          <Text style={[styles.channelName, { color: colors.text }]}>{channel.name}</Text>
          {isJoined && (
            <View style={[styles.joinedBadge, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.joinedBadgeText, { color: colors.primary }]}>Joined</Text>
            </View>
          )}
        </View>
        {lastMessage ? (
          <Text style={[styles.channelPreview, { color: colors.secondaryText }]} numberOfLines={1}>
            <Text style={{ fontWeight: "600" }}>{lastMessage.author}: </Text>
            {lastMessage.type === "image" ? "📷 Photo" : lastMessage.type === "sticker" ? "Sent a sticker" : lastMessage.text}
          </Text>
        ) : (
          <Text style={[styles.channelDesc, { color: colors.secondaryText }]} numberOfLines={1}>
            {channel.description}
          </Text>
        )}
        <Text style={[styles.channelMembers, { color: colors.tabBarInactive }]}>
          <Ionicons name="people-outline" size={11} /> {memberCount === undefined ? "…" : memberCount.toLocaleString()} members
        </Text>
      </View>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onJoinToggle(); }}
        disabled={pending}
        style={[
          styles.joinBtn,
          isJoined
            ? { backgroundColor: colors.secondary, borderColor: colors.border }
            : { backgroundColor: colors.primary },
          pending && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isJoined ? `Leave ${channel.name}` : `Join ${channel.name}`}
      >
        {pending ? (
          <ActivityIndicator size="small" color={isJoined ? colors.text : "#fff"} />
        ) : (
          <Text style={[styles.joinBtnText, { color: isJoined ? colors.text : "#fff" }]}>
            {isJoined ? "Leave" : "Join"}
          </Text>
        )}
      </TouchableOpacity>
    </Pressable>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

type BubbleProps = {
  msg: CommunityMessage;
  isMine: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onDelete?: () => void;
  /** Opens UserCardSheet for this message's author — absent (and the avatar/name become non-interactive) on legacy messages sent before authorId existed. */
  onAuthorPress?: () => void;
  /** Resolved live from publicProfiles by ChannelView's useAuthorProfiles — undefined while still loading, never a value cached on the message itself. */
  avatarUrl?: string | null;
  onLongPress?: () => void;
  /** True briefly right after a reply-preview tap scrolled here — a transient highlight, not persisted state. */
  highlighted?: boolean;
  /** Whether the original message this one replies to is still present in the currently-loaded page — drives "tap to view" vs "Original message unavailable". */
  replyTargetLoaded?: boolean;
  onPressReplyPreview?: () => void;
};

function MessageBubble({ msg, isMine, colors, onDelete, onAuthorPress, avatarUrl, onLongPress, highlighted, replyTargetLoaded, onPressReplyPreview }: BubbleProps) {
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const time = new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sticker = msg.type === "sticker" && msg.stickerId ? stickerById(msg.stickerId) : undefined;
  const isSticker = msg.type === "sticker" && !!sticker;
  const isImage = msg.type === "image" && !!msg.imageUrl;

  const bubbleContent = (
    <>
      {isSticker ? (
        <View style={styles.stickerBubble}>
          <Text style={styles.stickerEmoji}>{sticker!.emoji}</Text>
        </View>
      ) : isImage ? (
        <>
          <TouchableOpacity onPress={() => setImagePreviewVisible(true)} onLongPress={onLongPress} delayLongPress={400} accessibilityRole="button" accessibilityLabel="View full-size photo">
            <Image source={{ uri: msg.imageUrl }} style={styles.imageBubble} resizeMode="cover" />
          </TouchableOpacity>
          {msg.text ? (
            <Pressable
              onLongPress={onLongPress}
              delayLongPress={400}
              style={[
                styles.bubble,
                { marginTop: 4 },
                isMine ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.text }]}>{msg.text}</Text>
            </Pressable>
          ) : null}
          <Modal visible={imagePreviewVisible} transparent animationType="fade" onRequestClose={() => setImagePreviewVisible(false)}>
            <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreviewVisible(false)} accessibilityLabel="Close photo preview">
              <Image source={{ uri: msg.imageUrl }} style={styles.imagePreviewFull} resizeMode="contain" />
            </Pressable>
          </Modal>
        </>
      ) : (
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.bubble,
            isMine
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.text }]}>
            {msg.text}
          </Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={[styles.bubbleWrapper, isMine && styles.bubbleWrapperMine, highlighted && { backgroundColor: `${colors.primary}12`, borderRadius: 14 }]}>
      {!isMine && (
        <TouchableOpacity
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
          style={styles.avatarWrap}
          accessibilityRole={onAuthorPress ? "button" : undefined}
          accessibilityLabel={onAuthorPress ? `View ${msg.author}'s profile` : undefined}
        >
          <FriendAvatar username={msg.author} avatarUrl={avatarUrl ?? null} size={30} colors={colors} />
        </TouchableOpacity>
      )}
      <View style={{ maxWidth: "75%" }}>
        {!isMine && (
          <TouchableOpacity onPress={onAuthorPress} disabled={!onAuthorPress} accessibilityRole={onAuthorPress ? "button" : undefined}>
            <Text style={[styles.bubbleAuthor, { color: colors.secondaryText }]}>{msg.author}</Text>
          </TouchableOpacity>
        )}

        {msg.replyToMessageId && msg.replyPreview && (
          <TouchableOpacity
            onPress={onPressReplyPreview}
            disabled={!replyTargetLoaded}
            style={[styles.replyBlock, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}
            accessibilityRole={replyTargetLoaded ? "button" : undefined}
            accessibilityLabel={replyTargetLoaded ? `View original message from ${msg.replyPreview.senderDisplayName}` : "Original message unavailable"}
          >
            <Text style={[styles.replyBlockSender, { color: colors.primary }]} numberOfLines={1}>{msg.replyPreview.senderDisplayName}</Text>
            <Text style={[styles.replyBlockText, { color: colors.secondaryText }]} numberOfLines={1}>
              {msg.replyPreview.type === "sticker" ? "Sticker" : msg.replyPreview.type === "image" ? "📷 Photo" : msg.replyPreview.textPreview}
            </Text>
          </TouchableOpacity>
        )}

        {bubbleContent}

        <View style={[styles.bubbleMeta, isMine && { justifyContent: "flex-end" }]}>
          {msg.pending ? (
            <Text style={[styles.bubbleTime, { color: colors.tabBarInactive, fontStyle: "italic" }]}>Sending…</Text>
          ) : (
            <Text style={[styles.bubbleTime, { color: colors.tabBarInactive }]}>{time}</Text>
          )}
          {isMine && onDelete && (
            <TouchableOpacity onPress={onDelete} style={{ marginLeft: 8 }}>
              <Ionicons name="trash-outline" size={12} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/** Groups messages by local calendar day and injects a date-separator marker between groups — "same-day: HH:mm, different dates: a clear day/date separator" from the composer redesign spec. */
type ChatListItem = { kind: "separator"; id: string; label: string } | { kind: "message"; id: string; msg: CommunityMessage };

function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function buildChatListItems(messages: CommunityMessage[]): ChatListItem[] {
  const items: ChatListItem[] = [];
  let lastDay: string | null = null;
  for (const msg of messages) {
    const day = new Date(msg.createdAt).toDateString();
    if (day !== lastDay) {
      items.push({ kind: "separator", id: `sep_${day}`, label: dateSeparatorLabel(msg.createdAt) });
      lastDay = day;
    }
    items.push({ kind: "message", id: msg.id, msg });
  }
  return items;
}

// ── Channel Chat View ─────────────────────────────────────────────────────────

type ChannelViewProps = {
  channel: Channel;
  colors: ReturnType<typeof useTheme>["colors"];
  onBack: () => void;
};

function ChannelView({ channel, colors, onBack }: ChannelViewProps) {
  const { messages, sendMessage, deleteMessage, joinedChannelIds, joinChannel, memberCounts, pendingChannelIds } = useCommunity();
  const { profile } = useProfile();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [sendError, setSendError] = useState<string | null>(null);
  const { selectedUid: cardUid, openUserProfile: setCardUid, closeUserProfile: closeCardUid } = useUserProfileSheet();
  const [pendingImage, setPendingImage] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [trayVisible, setTrayVisible] = useState(false);
  const [trayTab, setTrayTab] = useState<"emoji" | "stickers">("emoji");
  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<CommunityMembership[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<CommunityMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<CommunityMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const flatRef = useRef<FlatList>(null);

  // Real member roster — only subscribed while the sheet is actually open,
  // so a chat screen sitting in the background isn't holding an extra
  // Firestore listener it doesn't need.
  useEffect(() => {
    if (!membersVisible) return;
    setMembersError(null);
    const unsub = subscribeToChannelMembers(
      channel.id,
      (list) => setMembers(list),
      (e) => setMembersError(e.message)
    );
    return unsub;
  }, [membersVisible, channel.id]);

  const memberProfiles = useAuthorProfiles((members ?? []).map((m) => m.uid));

  // Closes the Members sheet before opening UserCardSheet, instead of
  // stacking a second native Modal on top of one still animating closed
  // (BottomSheet keeps its Modal mounted through its ~180ms close animation
  // — see useSwipeToCloseSheet's CLOSE_DURATION). Two simultaneous Modals is
  // the documented New-Architecture/Fabric "touches get dropped inside a
  // Modal's separate native window" failure mode (see the comment at the
  // top of hooks/useSwipeToCloseSheet.ts) — this is what made tapping a
  // member either silently do nothing or leave the screen unresponsive.
  function openMemberProfile(uid: string) {
    setMembersVisible(false);
    setTimeout(() => setCardUid(uid), 200);
  }

  const isJoined = joinedChannelIds.includes(channel.id);
  const joinPending = pendingChannelIds.has(channel.id);

  // Non-members can read a public channel's messages too (firestore.rules
  // never required membership to read — see subscribeToChannelMessages's own
  // comment) — CommunityContext's own listeners only ever cover *joined*
  // channels by design (they're mounted app-wide for the whole session), so
  // a separate, scoped subscription opens here just for the channel this
  // screen is actually showing, and tears down the moment the viewer joins
  // (CommunityContext's own listener takes over) or navigates away.
  const [nonMemberMessages, setNonMemberMessages] = useState<CommunityMessage[] | null>(null);
  const [nonMemberError, setNonMemberError] = useState<string | null>(null);
  const [nonMemberRetryKey, setNonMemberRetryKey] = useState(0);
  useEffect(() => {
    if (isJoined) {
      setNonMemberMessages(null);
      setNonMemberError(null);
      return;
    }
    setNonMemberError(null);
    const unsub = subscribeToChannelMessages(
      channel.id,
      (msgs) => setNonMemberMessages(msgs),
      (e) => setNonMemberError(e.message)
    );
    return unsub;
  }, [isJoined, channel.id, nonMemberRetryKey]);

  // Real Firestore messages only — no seeded/placeholder conversation. An
  // empty channel shows a real "No messages yet" state (below) instead of
  // fake sample dialogue, and every avatar always has a real authorId to
  // open UserCardSheet with (seed messages had none, which is why avatars
  // silently did nothing in a channel that hadn't been chatted in yet).
  const allMessages = isJoined ? messages[channel.id] ?? EMPTY_MESSAGES : nonMemberMessages ?? EMPTY_MESSAGES;
  const messagesStillLoading = !isJoined && nonMemberMessages === null && !nonMemberError;
  const authorProfiles = useAuthorProfiles(allMessages.map((m) => m.authorId));
  const listItems = useMemo(() => buildChatListItems(allMessages), [allMessages]);
  // Which loaded page position each message is at — used both to scroll a
  // tapped reply-preview to its original, and to know whether that original
  // is even loaded (vs. "Original message unavailable").
  const messageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    listItems.forEach((item, i) => {
      if (item.kind === "message") map.set(item.msg.id, i);
    });
    return map;
  }, [listItems]);
  const messageById = useMemo(() => {
    const map = new Map<string, CommunityMessage>();
    allMessages.forEach((m) => map.set(m.id, m));
    return map;
  }, [allMessages]);

  function scrollToMessage(id: string) {
    const index = messageIndexById.get(id);
    if (index === undefined) return;
    try {
      flatRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch {
      // Virtualization sometimes can't jump straight there — onScrollToIndexFailed below retries.
    }
    setHighlightedMessageId(id);
    setTimeout(() => setHighlightedMessageId((cur) => (cur === id ? null : cur)), 1500);
  }

  function handleLongPressMessage(msg: CommunityMessage) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setActionMessage(msg);
  }

  function startReply() {
    if (!actionMessage) return;
    setReplyTarget(actionMessage);
    setActionMessage(null);
  }

  async function handleCopyMessage() {
    const target = actionMessage;
    setActionMessage(null);
    if (!target || target.type === "sticker" || !target.text) return;
    try {
      await Clipboard.setStringAsync(target.text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (e) {
      if (__DEV__) console.warn("[Community] copy failed", e);
    }
  }

  function handleDeleteFromMenu() {
    const target = actionMessage;
    setActionMessage(null);
    if (!target) return;
    deleteMessage(channel.id, target.id).catch(() => setSendError("Couldn't delete that message. Please try again."));
  }

  async function ensureJoined(): Promise<boolean> {
    if (isJoined) return true;
    const result = await joinChannel(channel.id);
    if (!result.ok) {
      setSendError(result.message);
      return false;
    }
    return true;
  }

  function insertEmoji(emoji: string) {
    const before = draft.slice(0, selection.start);
    const after = draft.slice(selection.end);
    const next = before + emoji + after;
    setDraft(next);
    const caret = before.length + emoji.length;
    setSelection({ start: caret, end: caret });
  }

  /** Maps a sendMessage() rejection to a real, specific message — moderation and length rejections have their own clear copy rather than falling into the generic network-error text. */
  function sendErrorMessage(e: unknown, fallback: string): string {
    if (e instanceof ModerationBlockedError) return moderationErrorMessage("content");
    if (e instanceof CommunityMessageTooLongError) return e.message;
    return fallback;
  }

  async function handleSendSticker(stickerId: string) {
    setTrayVisible(false);
    setSendError(null);
    if (!(await ensureJoined())) return;
    try {
      await sendMessage(channel.id, { type: "sticker", stickerId, replyTo: buildReplyTo() });
      setReplyTarget(null);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setSendError(sendErrorMessage(e, "Couldn't send that sticker. Please check your connection and try again."));
    }
  }

  async function handlePickImage() {
    setImageError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setImageError("Photo access was denied. Enable it in your device settings to attach a photo.");
        return;
      }
      // No aspect crop here — chat photos keep their real aspect ratio,
      // unlike the avatar's forced 1:1 crop.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setPendingImage({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
    } catch (e) {
      if (__DEV__) console.warn("[Community] image pick failed", e);
      setImageError("Couldn't open your photo library. Please try again.");
    }
  }

  function buildReplyTo() {
    if (!replyTarget) return undefined;
    return {
      messageId: replyTarget.id,
      preview: {
        senderId: replyTarget.authorId ?? "",
        senderDisplayName: replyTarget.author,
        type: (replyTarget.type ?? "text") as CommunityMessageType,
        textPreview: replyTarget.type === "sticker" ? "" : replyTarget.text.slice(0, 200),
      },
    };
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text && !pendingImage) return;
    setSendError(null);
    if (!(await ensureJoined())) return;
    const replyTo = buildReplyTo();

    if (pendingImage) {
      setUploadingImage(true);
      try {
        const { url, storagePath } = await uploadChannelImage(channel.id, user!.uid, pendingImage.uri, pendingImage.mimeType);
        await sendMessage(channel.id, { type: "image", imageUrl: url, imageStoragePath: storagePath, caption: text || undefined, replyTo });
        setPendingImage(null);
        setDraft("");
        setReplyTarget(null);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (e) {
        if (e instanceof ModerationBlockedError) {
          setImageError(moderationErrorMessage("content"));
        } else if (e instanceof CommunityMessageTooLongError) {
          setImageError(e.message);
        } else {
          const code = e instanceof AvatarServiceError ? e.code : "unknown";
          setImageError(avatarErrorMessage(code) || "Couldn't send that photo. Please try again.");
        }
      } finally {
        setUploadingImage(false);
      }
      return;
    }

    setSendingText(true);
    try {
      await sendMessage(channel.id, { type: "text", text, replyTo });
      setDraft("");
      setReplyTarget(null);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setSendError(sendErrorMessage(e, "Couldn't send that message. Please check your connection and try again."));
    } finally {
      setSendingText(false);
    }
  }

  // Scroll to bottom on first render
  useEffect(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 150);
  }, []);

  // Scroll to bottom whenever the keyboard opens so the latest message stays visible
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => sub.remove();
  }, []);

  const canSend = (draft.trim().length > 0 || !!pendingImage) && !uploadingImage && !sendingText;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Chat header */}
      <SafeAreaView edges={["top"]} style={[styles.chatHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.chatHeaderIcon, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name={channel.icon as any} size={18} color={colors.primary} />
        </View>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setMembersVisible(true)} accessibilityRole="button" accessibilityLabel="View members">
          <Text style={[styles.chatHeaderTitle, { color: colors.text }]}>{channel.name}</Text>
          <Text style={[styles.chatHeaderSub, { color: colors.secondaryText }]}>
            {(memberCounts[channel.id] ?? 0).toLocaleString()} members
          </Text>
        </TouchableOpacity>
        {!isJoined && (
          <TouchableOpacity
            onPress={() => joinChannel(channel.id).then((r) => { if (!r.ok) setSendError(r.message); })}
            disabled={joinPending}
            style={[styles.joinSmallBtn, { backgroundColor: colors.primary, opacity: joinPending ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Join ${channel.name}`}
          >
            {joinPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Join</Text>}
          </TouchableOpacity>
        )}
      </SafeAreaView>
      {sendError && (
        <View style={[styles.chatErrorBanner, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.chatErrorText, { color: colors.danger }]}>{sendError}</Text>
        </View>
      )}

      <FlatList
        ref={flatRef}
        data={listItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.chatList, listItems.length === 0 && { flex: 1 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          messagesStillLoading ? (
            <View style={styles.emptyChatState}>
              <ActivityIndicator size="small" color={colors.secondaryText} />
            </View>
          ) : nonMemberError ? (
            <View style={styles.emptyChatState}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.secondaryText} />
              <Text style={[styles.emptyChatTitle, { color: colors.text }]}>Couldn&apos;t load messages</Text>
              <Text style={[styles.emptyChatSubtitle, { color: colors.secondaryText }]}>{nonMemberError}</Text>
              <TouchableOpacity
                onPress={() => { setNonMemberError(null); setNonMemberMessages(null); setNonMemberRetryKey((k) => k + 1); }}
                style={[styles.joinSmallBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                accessibilityRole="button"
                accessibilityLabel="Retry loading messages"
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyChatState}>
              <Ionicons name="chatbubbles-outline" size={32} color={colors.secondaryText} />
              <Text style={[styles.emptyChatTitle, { color: colors.text }]}>No messages yet</Text>
              <Text style={[styles.emptyChatSubtitle, { color: colors.secondaryText }]}>
                {isJoined ? "Be the first to say something in this community." : "Join to be the first to start the conversation."}
              </Text>
            </View>
          )
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatRef.current?.scrollToIndex({ index: Math.min(info.index, info.highestMeasuredFrameIndex), animated: true });
          }, 100);
        }}
        renderItem={({ item }) =>
          item.kind === "separator" ? (
            <View style={styles.dateSeparatorRow}>
              <Text style={[styles.dateSeparatorText, { color: colors.secondaryText, backgroundColor: colors.background }]}>{item.label}</Text>
            </View>
          ) : (
            <MessageBubble
              msg={item.msg}
              isMine={item.msg.authorId ? item.msg.authorId === user?.uid : item.msg.author === (profile.username || "You")}
              colors={colors}
              onDelete={
                // Strict authorId match only (not the username fallback
                // `isMine` uses for bubble styling) — a legacy message with no
                // authorId can never satisfy firestore.rules' delete
                // condition, so it never gets an onDelete handler in the
                // first place rather than offering a control that would fail.
                !item.msg.authorId || item.msg.authorId !== user?.uid
                  ? undefined
                  : () => deleteMessage(channel.id, item.msg.id).catch(() => setSendError("Couldn't delete that message. Please try again."))
              }
              onAuthorPress={item.msg.authorId ? () => setCardUid(item.msg.authorId!) : undefined}
              avatarUrl={item.msg.authorId ? authorProfiles.get(item.msg.authorId)?.avatarUrl : null}
              onLongPress={() => handleLongPressMessage(item.msg)}
              highlighted={item.msg.id === highlightedMessageId}
              replyTargetLoaded={!!item.msg.replyToMessageId && messageById.has(item.msg.replyToMessageId)}
              onPressReplyPreview={item.msg.replyToMessageId ? () => scrollToMessage(item.msg.replyToMessageId!) : undefined}
            />
          )
        }
      />

      <UserCardSheet uid={cardUid} onClose={closeCardUid} colors={colors} />

      {imageError && (
        <View style={[styles.chatErrorBanner, { backgroundColor: colors.danger + "18", borderColor: colors.danger, marginBottom: 0 }]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.chatErrorText, { color: colors.danger }]}>{imageError}</Text>
        </View>
      )}

      {pendingImage && (
        <View style={[styles.imagePreviewRow, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <Image source={{ uri: pendingImage.uri }} style={styles.imagePreviewThumb} resizeMode="cover" />
          <Text style={[styles.imagePreviewLabel, { color: colors.secondaryText }]} numberOfLines={1}>
            {uploadingImage ? "Sending photo…" : "Ready to send"}
          </Text>
          {!uploadingImage && (
            <TouchableOpacity onPress={() => setPendingImage(null)} accessibilityRole="button" accessibilityLabel="Remove photo">
              <Ionicons name="close-circle" size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {copyFeedback && (
        <View style={[styles.copyToast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          <Text style={[styles.copyToastText, { color: colors.text }]}>Copied to clipboard</Text>
        </View>
      )}

      {replyTarget && (
        <View style={[styles.replyBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.replyBarAccent, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.replyBarSender, { color: colors.primary }]} numberOfLines={1}>Replying to {replyTarget.author}</Text>
            <Text style={[styles.replyBarPreview, { color: colors.secondaryText }]} numberOfLines={1}>
              {replyTarget.type === "sticker" ? "Sticker" : replyTarget.type === "image" ? "📷 Photo" : replyTarget.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTarget(null)} accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reading is open to any signed-in user (see subscribeToChannelMessages),
          but posting is a member action — this replaces the composer
          entirely for a non-member rather than leaving a freely-typable
          input that only fails (or silently auto-joins) on send. */}
      {isJoined ? (
        // Composer — one coherent rounded pill (attachment + emoji/sticker +
        // input + send) instead of a wide flat bar with a disconnected
        // circular send button floating outside it.
        <View style={[styles.composerBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <View style={[styles.composerPill, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={handlePickImage}
              style={styles.composerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo"
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.secondaryText} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTrayVisible(true)}
              style={styles.composerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Emoji and stickers"
            >
              <Ionicons name="happy-outline" size={22} color={colors.secondaryText} />
            </TouchableOpacity>
            <TextInput
              style={[styles.chatInput, { color: colors.text }]}
              placeholder="Message..."
              placeholderTextColor={colors.secondaryText}
              value={draft}
              onChangeText={setDraft}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            style={[styles.sendBtn, { backgroundColor: colors.primary }, !canSend && { opacity: 0.4 }]}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            {uploadingImage || sendingText ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.joinPromptBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.joinPromptText, { color: colors.secondaryText }]}>
            Join this community to post and participate in discussions.
          </Text>
          <TouchableOpacity
            onPress={() => joinChannel(channel.id).then((r) => { if (!r.ok) setSendError(r.message); })}
            disabled={joinPending}
            style={[styles.joinPromptBtn, { backgroundColor: colors.primary, opacity: joinPending ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Join ${channel.name}`}
          >
            {joinPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Join community</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji/sticker tray — shared BottomSheet, not a second sheet system. */}
      <BottomSheet visible={trayVisible} onClose={() => setTrayVisible(false)} colors={colors} maxHeight="55%">
        <View style={[styles.trayTabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.trayTabPill, trayTab === "emoji" && { backgroundColor: colors.primary }]}
            onPress={() => setTrayTab("emoji")}
          >
            <Text style={[styles.trayTabText, { color: trayTab === "emoji" ? "#fff" : colors.secondaryText }]}>Emoji</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.trayTabPill, trayTab === "stickers" && { backgroundColor: colors.primary }]}
            onPress={() => setTrayTab("stickers")}
          >
            <Text style={[styles.trayTabText, { color: trayTab === "stickers" ? "#fff" : colors.secondaryText }]}>Stickers</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.trayGrid} showsVerticalScrollIndicator={false}>
          {trayTab === "emoji"
            ? QUICK_EMOJI.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.trayEmojiBtn}
                  onPress={() => insertEmoji(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${emoji}`}
                >
                  <Text style={styles.trayEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))
            : STICKER_PACK.map((sticker) => (
                <TouchableOpacity
                  key={sticker.id}
                  style={styles.trayEmojiBtn}
                  onPress={() => handleSendSticker(sticker.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${sticker.label} sticker`}
                >
                  <Text style={styles.trayEmojiText}>{sticker.emoji}</Text>
                </TouchableOpacity>
              ))}
        </ScrollView>
      </BottomSheet>

      {/* Member list — real communityMemberships docs (services/communityService.ts), never a hardcoded/placeholder roster. No role concept (owner/admin) exists in this app's data model — channels are static, not owned by any user — so every member is shown the same way rather than fabricating roles. */}
      <BottomSheet visible={membersVisible} onClose={() => setMembersVisible(false)} colors={colors} maxHeight="70%">
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Members</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.secondaryText }]}>
          {(memberCounts[channel.id] ?? members?.length ?? 0).toLocaleString()} joined
        </Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
          {membersError ? (
            <View style={styles.paneStateBox}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.secondaryText} />
              <Text style={[styles.emptyChatSubtitle, { color: colors.secondaryText }]}>{membersError}</Text>
            </View>
          ) : members === null ? (
            <View style={styles.paneStateBox}>
              <ActivityIndicator size="small" color={colors.secondaryText} />
            </View>
          ) : members.length === 0 ? (
            <View style={styles.paneStateBox}>
              <Text style={[styles.emptyChatSubtitle, { color: colors.secondaryText }]}>No members yet.</Text>
            </View>
          ) : (
            members.map((m) => {
              const p = memberProfiles.get(m.uid);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={styles.memberRow}
                  onPress={() => openMemberProfile(m.uid)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${m.username}'s profile`}
                >
                  <FriendAvatar username={m.username} avatarUrl={p?.avatarUrl} size={40} colors={colors} />
                  <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                    <Text style={[styles.requestName, { color: colors.text }]} numberOfLines={1}>{m.username}</Text>
                    {p?.city ? (
                      <Text style={[styles.requestCity, { color: colors.secondaryText }]} numberOfLines={1}>{p.city}</Text>
                    ) : null}
                  </View>
                  {m.uid === user?.uid && (
                    <Text style={[styles.pendingLabel, { color: colors.secondaryText }]}>You</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>

      {/* Long-press message actions — every action shown here actually
          works (rule: no decorative actions). Reporting was left out
          entirely rather than added as a non-functional button, since no
          report/moderation system exists anywhere in this app yet. */}
      <BottomSheet visible={!!actionMessage} onClose={() => setActionMessage(null)} colors={colors} maxHeight="40%">
        {actionMessage && (
          <View style={{ gap: 4 }}>
            <TouchableOpacity onPress={startReply} style={styles.actionMenuRow} accessibilityRole="button" accessibilityLabel="Reply">
              <Ionicons name="arrow-undo-outline" size={19} color={colors.text} />
              <Text style={[styles.actionMenuText, { color: colors.text }]}>Reply</Text>
            </TouchableOpacity>
            {actionMessage.type !== "sticker" && actionMessage.text ? (
              <TouchableOpacity onPress={handleCopyMessage} style={styles.actionMenuRow} accessibilityRole="button" accessibilityLabel="Copy text">
                <Ionicons name="copy-outline" size={19} color={colors.text} />
                <Text style={[styles.actionMenuText, { color: colors.text }]}>Copy</Text>
              </TouchableOpacity>
            ) : null}
            {actionMessage.authorId && actionMessage.authorId === user?.uid && (
              <TouchableOpacity onPress={handleDeleteFromMenu} style={styles.actionMenuRow} accessibilityRole="button" accessibilityLabel="Delete message">
                <Ionicons name="trash-outline" size={19} color={colors.danger} />
                <Text style={[styles.actionMenuText, { color: colors.danger }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const { colors } = useTheme();
  const { channels, messages, joinedChannelIds, joinChannel, leaveChannel, memberCounts, pendingChannelIds } = useCommunity();
  const { profile } = useProfile();

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleJoinToggle(channelId: string) {
    setJoinError(null);
    const result = joinedChannelIds.includes(channelId) ? await leaveChannel(channelId) : await joinChannel(channelId);
    if (!result.ok) setJoinError(result.message);
  }

  if (activeChannel) {
    return (
      <ChannelView
        channel={activeChannel}
        colors={colors}
        onBack={() => setActiveChannel(null)}
      />
    );
  }

  const displayed = channels.filter((c) => {
    if (filter === "mine" && !joinedChannelIds.includes(c.id)) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function getLastMessage(channelId: string): CommunityMessage | undefined {
    const msgs = messages[channelId];
    return msgs?.[msgs.length - 1];
  }

  return (
    <SwipeableTab tabIndex={2} backgroundColor={colors.background} colors={colors}>
    {/* Bottom inset excluded — the Tabs navigator's own tab bar already
        reserves it (see hooks/useTabBarHeight.ts). */}
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.disclaimerPad}>
        <InlinePageDisclaimer screenKey="/community" colors={colors} />
      </View>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Community</Text>
          <Text style={[styles.headerSub, { color: colors.secondaryText }]}>
            Connect with teens who share your hobbies
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <TipBanner
          storageKey={TIP_KEYS.communityChannels}
          text="Join channels that match your hobbies to chat with others who share your interests!"
          icon="people-outline"
          colors={colors}
        />
        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search channels..."
              placeholderTextColor={colors.secondaryText}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Profile hobby suggestions */}
        {profile.hobbies.length > 0 && (
          <View style={styles.suggestSection}>
            <Text style={[styles.suggestLabel, { color: colors.secondaryText }]}>
              Channels matching your hobbies
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {profile.hobbies.map((hobby) => {
                const match = channels.find((c) =>
                  c.name.toLowerCase().includes(hobby.toLowerCase()) ||
                  hobby.toLowerCase().includes(c.id.toLowerCase())
                );
                if (!match) return null;
                const joined = joinedChannelIds.includes(match.id);
                return (
                  <TouchableOpacity
                    key={match.id}
                    onPress={() => setActiveChannel(match)}
                    style={[
                      styles.suggestChip,
                      { backgroundColor: joined ? colors.primary : colors.card, borderColor: joined ? colors.primary : colors.border },
                    ]}
                  >
                    <Ionicons name={match.icon as any} size={14} color={joined ? "#fff" : colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: joined ? "#fff" : colors.text, fontWeight: "600", fontSize: 13 }}>
                      {match.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(["all", "mine"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                filter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.filterChipText, { color: filter === f ? "#fff" : colors.secondaryText }]}>
                {f === "all" ? "All Channels" : `My Channels (${joinedChannelIds.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {joinError && (
          <View style={[styles.chatErrorBanner, { backgroundColor: colors.danger + "18", borderColor: colors.danger, marginHorizontal: 16, marginTop: 12 }]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={[styles.chatErrorText, { color: colors.danger }]}>{joinError}</Text>
          </View>
        )}

        {/* Channel list */}
        <View style={styles.channelList}>
          {displayed.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {filter === "mine" ? "No channels joined yet" : "No results"}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                {filter === "mine"
                  ? "Browse all channels and tap Join to get started."
                  : "Try a different search term."}
              </Text>
              {filter === "mine" && (
                <TouchableOpacity onPress={() => setFilter("all")} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Browse All</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayed.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                isJoined={joinedChannelIds.includes(ch.id)}
                memberCount={memberCounts[ch.id]}
                pending={pendingChannelIds.has(ch.id)}
                lastMessage={getLastMessage(ch.id)}
                colors={colors}
                onPress={() => setActiveChannel(ch)}
                onJoinToggle={() => handleJoinToggle(ch.id)}
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  disclaimerPad: { paddingHorizontal: 16, paddingTop: 10 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  suggestSection: { paddingHorizontal: 16, marginTop: 14 },
  suggestLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 14, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: "600" },
  channelList: { padding: 16, gap: 10 },
  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  channelIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  channelInfo: { flex: 1 },
  channelTop: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  channelName: { fontSize: 15, fontWeight: "700", marginRight: 6 },
  joinedBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  joinedBadgeText: { fontSize: 11, fontWeight: "700" },
  channelDesc: { fontSize: 14, lineHeight: 18, marginBottom: 4 },
  channelPreview: { fontSize: 14, lineHeight: 18, marginBottom: 4 },
  channelMembers: { fontSize: 11 },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
  },
  joinBtnText: { fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  emptyBody: { textAlign: "center", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  // Chat
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 6 },
  chatHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chatHeaderTitle: { fontSize: 16, fontWeight: "700" },
  chatHeaderSub: { fontSize: 12 },
  chatErrorBanner: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, padding: 10 },
  chatErrorText: { fontSize: 12, flex: 1 },
  joinSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  chatList: { padding: 16, gap: 8 },
  emptyChatState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 32 },
  emptyChatTitle: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  emptyChatSubtitle: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  bubbleWrapper: { flexDirection: "row", alignItems: "flex-end" },
  bubbleWrapperMine: { justifyContent: "flex-end" },
  avatarWrap: { marginRight: 8, marginBottom: 18 },
  bubbleAuthor: { fontSize: 11, fontWeight: "600", marginBottom: 3, marginLeft: 4 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", marginTop: 2, paddingHorizontal: 4 },
  bubbleTime: { fontSize: 10 },

  replyBlock: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 3 },
  replyBlockSender: { fontSize: 11, fontWeight: "700" },
  replyBlockText: { fontSize: 12, marginTop: 1 },

  copyToast: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 4 },
  copyToastText: { fontSize: 12, fontWeight: "600" },

  replyBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  replyBarAccent: { width: 3, height: 30, borderRadius: 2 },
  replyBarSender: { fontSize: 12, fontWeight: "700" },
  replyBarPreview: { fontSize: 12, marginTop: 1 },

  actionMenuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  actionMenuText: { fontSize: 15, fontWeight: "600" },

  stickerBubble: { alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  stickerEmoji: { fontSize: 56, lineHeight: 64 },
  imageBubble: { width: 220, height: 220 * 0.82, borderRadius: 16 },
  imagePreviewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  imagePreviewFull: { width: "100%", height: "80%" },

  dateSeparatorRow: { alignItems: "center", marginVertical: 10 },
  dateSeparatorText: { fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },

  imagePreviewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  imagePreviewThumb: { width: 44, height: 44, borderRadius: 10 },
  imagePreviewLabel: { flex: 1, fontSize: 13 },

  // Composer — one coherent rounded pill (attachment icon, emoji/sticker
  // icon, and the growing text input all share one background/border) with
  // the send button as its own filled circle just outside it, close enough
  // to read as one connected control rather than two disjoint pieces.
  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  joinPromptBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  joinPromptText: { flex: 1, fontSize: 13, lineHeight: 18 },
  joinPromptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  composerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    borderWidth: 1,
    paddingLeft: 6,
    paddingRight: 10,
  },
  composerIconBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  chatInput: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  trayTabRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 12 },
  trayTabPill: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  trayTabText: { fontSize: 13, fontWeight: "700" },
  trayGrid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 12 },
  trayEmojiBtn: { width: "16.66%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  trayEmojiText: { fontSize: 30 },

  sheetTitle: { fontSize: 19, fontWeight: "800" },
  sheetSubtitle: { fontSize: 12, marginTop: 2 },
  paneStateBox: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  requestName: { fontSize: 14, fontWeight: "700" },
  requestCity: { fontSize: 12, marginTop: 1 },
  pendingLabel: { fontSize: 11, fontWeight: "600" },
});
