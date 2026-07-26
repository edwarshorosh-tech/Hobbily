/**
 * communityService — Firestore I/O for channel membership.
 *
 * Membership used to be a device-local AsyncStorage list — it looked like a
 * "Join" button that worked, but nothing was ever verified server-side,
 * nothing survived a reinstall or a second device, and there was no way to
 * enforce "one membership per user per channel" beyond hoping the client
 * behaved. communityMemberships/{channelId}_{uid} fixes all three: the
 * deterministic doc ID *is* the uniqueness constraint (a second "join" is
 * just a re-write of the same doc, not a new one), the doc only exists
 * server-side once Firestore accepts the write, and firestore.rules only
 * lets a user create/delete their own membership doc.
 *
 * No channel is currently private (see types/CommunityMessage.ts's Channel),
 * so every join today resolves straight to "joined". `status: "pending"` and
 * requestToJoinChannel exist so a future private channel has somewhere to
 * plug in, but there's deliberately no approval UI built yet — channels
 * don't have an owner/moderator concept in this app, so "who approves a
 * pending request" isn't answerable yet; building that is a separate,
 * larger feature (channel ownership) this pass didn't include.
 */
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  deleteDoc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { CommunityMembership, CommunityMessage } from "../types/CommunityMessage";
import { mapFirebaseError } from "./firebaseErrors";

/** Bounded page cap — matches CommunityContext's own joined-channel message listener (see its own comment); no unbounded full-history read on either path. */
const MESSAGE_PAGE_SIZE = 200;

const MEMBERSHIPS = "communityMemberships";

export type CommunityServiceErrorCode = "permission-denied" | "network-error" | "unknown";

export class CommunityServiceError extends Error {
  code: CommunityServiceErrorCode;
  constructor(code: CommunityServiceErrorCode, message: string) {
    super(message);
    this.name = "CommunityServiceError";
    this.code = code;
  }
}

function mapError(e: unknown): CommunityServiceError {
  const { code, message } = mapFirebaseError(e, "communityService");
  return new CommunityServiceError(code, message);
}

function membershipId(channelId: string, uid: string): string {
  return `${channelId}_${uid}`;
}

/** Joins a (non-private) channel. Idempotent: joining a channel you're already in just re-writes the same doc — never creates a duplicate, never throws. */
export async function joinChannel(channelId: string, uid: string, username: string): Promise<void> {
  try {
    await setDoc(doc(db, MEMBERSHIPS, membershipId(channelId, uid)), {
      channelId,
      uid,
      username,
      status: "joined",
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    throw mapError(e);
  }
}

/** Leaves a channel. Idempotent: leaving a channel you're not in is a no-op, not an error. */
export async function leaveChannel(channelId: string, uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, MEMBERSHIPS, membershipId(channelId, uid)));
  } catch (e) {
    throw mapError(e);
  }
}

/** Live-subscribes to every channel the given user has joined. */
export function subscribeToMyMemberships(
  uid: string,
  onChange: (memberships: CommunityMembership[]) => void,
  onError?: (e: CommunityServiceError) => void
): Unsubscribe {
  const q = query(collection(db, MEMBERSHIPS), where("uid", "==", uid), where("status", "==", "joined"));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityMembership))),
    (err) => onError?.(mapError(err))
  );
}

/** One-time real member count for a single channel (joined members only). Uses a count() aggregation query — no document bodies transferred. */
export async function fetchMemberCount(channelId: string): Promise<number> {
  try {
    const q = query(collection(db, MEMBERSHIPS), where("channelId", "==", channelId), where("status", "==", "joined"));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    throw mapError(e);
  }
}

/** Real count of communities a given user has joined — uses the uid+status composite index firestore.indexes.json already declares (the same one subscribeToMyMemberships relies on), so no new index is needed. Used by Public Profile's info grid for any uid, not just the signed-in user. */
export async function fetchUserCommunityCount(uid: string): Promise<number> {
  try {
    const q = query(collection(db, MEMBERSHIPS), where("uid", "==", uid), where("status", "==", "joined"));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * One-shot real list of the communities a given user has joined — reuses the
 * exact same uid+status index as fetchUserCommunityCount/
 * subscribeToMyMemberships above (no new Firestore index needed). Powers
 * app/profile-activity/[uid].tsx's Communities list for any uid, not just
 * the signed-in user — firestore.rules already allows any signed-in user to
 * read communityMemberships/{id} docs.
 */
export async function fetchUserCommunities(uid: string): Promise<CommunityMembership[]> {
  try {
    const q = query(collection(db, MEMBERSHIPS), where("uid", "==", uid), where("status", "==", "joined"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityMembership));
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * Live-subscribes to every joined member of one channel — the real roster,
 * not just "am I in it" (subscribeToMyMemberships above). firestore.rules
 * lets any signed-in user read communityMemberships/{id} docs (needed for
 * the member count aggregation this app already had), so this is the same
 * trust level, just returning the full documents instead of a count.
 */
export function subscribeToChannelMembers(
  channelId: string,
  onChange: (members: CommunityMembership[]) => void,
  onError?: (e: CommunityServiceError) => void
): Unsubscribe {
  // channelId+status is the composite index fetchMemberCount above already
  // relies on and firestore.indexes.json already declares — adding an
  // orderBy("createdAt") here would need a *different*, undeployed
  // composite index (channelId+status+createdAt), so members are sorted
  // client-side after the fetch instead, the same avoid-a-new-index
  // approach already used elsewhere in this app (see useAuthorPosts.ts).
  const q = query(collection(db, MEMBERSHIPS), where("channelId", "==", channelId), where("status", "==", "joined"));
  return onSnapshot(
    q,
    (snap) => {
      const members = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityMembership));
      members.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onChange(members);
    },
    (err) => onError?.(mapError(err))
  );
}

/**
 * Live-subscribes to one channel's messages without requiring membership.
 * firestore.rules already allows any signed-in user to read
 * channels/{channelId}/messages (no membership check in the read rule) —
 * the same trust level subscribeToChannelMembers above already relies on
 * for the roster. CommunityContext's own message listeners deliberately
 * only ever subscribe channels the current user has *joined* (they're
 * mounted app-wide and kept alive for the "sending…" pending-write signal —
 * see CommunityContext.tsx's own comment), so this is a separate, scoped
 * subscription a screen can open just for the one channel it's currently
 * showing, whether or not the viewer has joined it yet — without the
 * app-root provider having to hold a live listener on every public channel
 * all the time.
 */
export function subscribeToChannelMessages(
  channelId: string,
  onChange: (messages: CommunityMessage[]) => void,
  onError?: (e: CommunityServiceError) => void
): Unsubscribe {
  const q = query(collection(db, "channels", channelId, "messages"), orderBy("createdAt", "asc"), limit(MESSAGE_PAGE_SIZE));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityMessage))),
    (err) => onError?.(mapError(err))
  );
}

/** Real member counts for every given channel, in parallel. A failed individual count is reported as 0 rather than failing the whole batch — the join/leave flow itself doesn't depend on this number being exact. */
export async function fetchMemberCounts(channelIds: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    channelIds.map(async (id) => {
      try {
        return [id, await fetchMemberCount(id)] as const;
      } catch {
        return [id, 0] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}
