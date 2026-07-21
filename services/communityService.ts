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
  onSnapshot,
  query,
  setDoc,
  where,
  Unsubscribe,
} from "firebase/firestore";
import { CommunityMembership } from "../types/CommunityMessage";
import { mapFirebaseError } from "./firebaseErrors";

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
