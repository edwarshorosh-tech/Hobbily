/** Absent on every message sent before this field existed — always treated as "text" (see the fallback in app/(tabs)/community.tsx). */
export type CommunityMessageType = "text" | "image" | "sticker";

/** Denormalized enough to render a reply block without a second read — the canonical relation is still replyToMessageId, which tap-to-scroll and "deleted original" detection use, never this preview alone. */
export type ReplyPreview = {
  senderId: string;
  senderDisplayName: string;
  type: CommunityMessageType;
  /** Empty for "sticker"/"image"-without-caption. */
  textPreview: string;
};

/** A single message posted in a hobby channel */
export type CommunityMessage = {
  id: string;
  channelId: string;
  /** UID of the sender — the real ownership key (see firestore.rules) and what UserCardSheet opens from. Absent on messages sent before this field existed (see the fallback in app/(tabs)/community.tsx). */
  authorId?: string;
  author: string;
  type?: CommunityMessageType;
  /** The message body for "text", an optional caption for "image", empty for "sticker". */
  text: string;
  imageUrl?: string;
  imageStoragePath?: string;
  /** One of STICKER_PACK's ids (utils/stickers.ts) for "sticker" messages. */
  stickerId?: string;
  /** The message this one replies to, if any. The canonical relation — replyPreview is just a denormalized display copy of it at send time, never trusted alone (e.g. for "was the original deleted" — that's answered by looking the id up in the loaded page, not the preview). */
  replyToMessageId?: string;
  replyPreview?: ReplyPreview;
  createdAt: string;
  /** Client-only, never persisted — true while this message is still writing to the server (Firestore's snapshot.metadata.hasPendingWrites), used to show a "Sending…" state. */
  pending?: boolean;
};

/** A hobby-based discussion channel — static metadata defined in code (see context/CommunityContext.tsx's DEFAULT_CHANNELS); membership itself lives in Firestore (see services/communityService.ts), never here and never in AsyncStorage. */
export type Channel = {
  id: string;
  name: string;
  /** Ionicons icon name */
  icon: string;
  description: string;
  /** When true, joining requires the (not-yet-built) approval flow — see the note on requestToJoinChannel in services/communityService.ts. No channel currently sets this. */
  isPrivate?: boolean;
};

/** communityMemberships/{channelId}_{uid} — the real, server-side record of "this user is in this channel." */
export type CommunityMembershipStatus = "joined" | "pending";

export type CommunityMembership = {
  id: string;
  channelId: string;
  uid: string;
  username: string;
  status: CommunityMembershipStatus;
  createdAt: string;
};
