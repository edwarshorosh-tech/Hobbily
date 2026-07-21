/**
 * friendsService
 * Firestore CRUD + queries for the friends feature: friendships/{pairId} and
 * reads of publicProfiles/{uid}. All Firebase access for the friends feature
 * lives here — contexts/components never call Firestore directly.
 */
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Transaction,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Friendship, FriendshipStatus } from "../types/Friendship";
import { PublicProfile } from "../types/PublicProfile";
import { buildNotificationPayload, notificationsCollection } from "./notificationsService";
import { mapFirebaseError } from "./firebaseErrors";
import { normalizeUsername, generateFriendshipPairId } from "../utils/friendIdentity";
import { normalizePublicProfile } from "../utils/normalizePublicProfile";
import { rankFriendRecommendations } from "../utils/friendRecommendations";

export { normalizeUsername, generateFriendshipPairId };

// ── View-model types ──────────────────────────────────────────────────────────

export type FriendRelationshipStatus =
  | "none"
  | "self"
  | "outgoing_pending"
  | "incoming_pending"
  | "friends"
  | "declined"
  | "cancelled";

export type FriendSearchResult = {
  profile: PublicProfile;
  relationship: FriendRelationshipStatus;
  friendshipId: string | null;
};

// ── Errors ─────────────────────────────────────────────────────────────────────

export type FriendServiceErrorCode =
  | "unauthenticated"
  | "invalid-query"
  | "self-request"
  | "already-friends"
  | "already-requested"
  | "not-found"
  | "not-participant"
  | "not-recipient"
  | "not-sender"
  | "invalid-status"
  | "permission-denied"
  | "network-error"
  | "unknown";

export class FriendServiceError extends Error {
  code: FriendServiceErrorCode;
  constructor(code: FriendServiceErrorCode, message: string) {
    super(message);
    this.name = "FriendServiceError";
    this.code = code;
  }
}

function mapFirestoreError(e: unknown): FriendServiceError {
  const { code, message } = mapFirebaseError(e, "friendsService");
  return new FriendServiceError(code, message);
}

// ── Mutations ──────────────────────────────────────────────────────────────────

/**
 * `actorUsername` is the current user's own username (already known to the
 * caller via useProfile() — no extra read needed) — embedded into the
 * recipient's notification body at creation time.
 */
export async function createFriendRequest(
  currentUid: string,
  targetUid: string,
  actorUsername: string
): Promise<void> {
  if (!currentUid) throw new FriendServiceError("unauthenticated", "Not signed in.");
  if (currentUid === targetUid) throw new FriendServiceError("self-request", "You can't add yourself.");

  const pairId = generateFriendshipPairId(currentUid, targetUid);
  const ref = doc(db, "friendships", pairId);

  function notifyRecipient(tx: Transaction) {
    tx.set(
      doc(notificationsCollection(targetUid)),
      buildNotificationPayload({
        recipientId: targetUid,
        type: "friend_request_received",
        title: "New friend request",
        body: `${actorUsername || "Someone"} wants to be your friend.`,
        actorId: currentUid,
        entityId: pairId,
        route: { screen: "profile_friends_requests" },
      })
    );
  }

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      if (snap.exists()) {
        const data = snap.data() as Friendship;
        if (data.status === "accepted") {
          throw new FriendServiceError("already-friends", "You're already friends.");
        }
        if (data.status === "pending") {
          throw new FriendServiceError("already-requested", "A request is already pending.");
        }
        // declined or cancelled — allow a fresh request, resetting direction/timestamps.
        tx.set(
          ref,
          {
            requestedBy: currentUid,
            requestedTo: targetUid,
            status: "pending" as FriendshipStatus,
            updatedAt: serverTimestamp(),
            acceptedAt: null,
            declinedAt: null,
          },
          { merge: true }
        );
        notifyRecipient(tx);
        return;
      }

      const participants: [string, string] =
        currentUid < targetUid ? [currentUid, targetUid] : [targetUid, currentUid];

      tx.set(ref, {
        participants,
        requestedBy: currentUid,
        requestedTo: targetUid,
        status: "pending" as FriendshipStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
      });
      notifyRecipient(tx);
    });
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

/** `actorUsername` is the accepter's (current user's) own username. */
export async function acceptFriendRequest(
  currentUid: string,
  friendshipId: string,
  actorUsername: string
): Promise<void> {
  const ref = doc(db, "friendships", friendshipId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new FriendServiceError("not-found", "This request no longer exists.");
      const data = snap.data() as Friendship;
      if (data.requestedTo !== currentUid) {
        throw new FriendServiceError("not-recipient", "Only the recipient can accept this request.");
      }
      if (data.status !== "pending") {
        throw new FriendServiceError("invalid-status", "This request is no longer pending.");
      }
      tx.update(ref, {
        status: "accepted" as FriendshipStatus,
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.set(
        doc(notificationsCollection(data.requestedBy)),
        buildNotificationPayload({
          recipientId: data.requestedBy,
          type: "friend_request_accepted",
          title: "Friend request accepted",
          body: `${actorUsername || "Someone"} accepted your friend request.`,
          actorId: currentUid,
          entityId: friendshipId,
          route: { screen: "profile_friends" },
        })
      );
    });
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

export async function declineFriendRequest(currentUid: string, friendshipId: string): Promise<void> {
  const ref = doc(db, "friendships", friendshipId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new FriendServiceError("not-found", "This request no longer exists.");
      const data = snap.data() as Friendship;
      if (data.requestedTo !== currentUid) {
        throw new FriendServiceError("not-recipient", "Only the recipient can decline this request.");
      }
      if (data.status !== "pending") {
        throw new FriendServiceError("invalid-status", "This request is no longer pending.");
      }
      tx.update(ref, {
        status: "declined" as FriendshipStatus,
        declinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

export async function cancelFriendRequest(currentUid: string, friendshipId: string): Promise<void> {
  const ref = doc(db, "friendships", friendshipId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new FriendServiceError("not-found", "This request no longer exists.");
      const data = snap.data() as Friendship;
      if (data.requestedBy !== currentUid) {
        throw new FriendServiceError("not-sender", "Only the sender can cancel this request.");
      }
      if (data.status !== "pending") {
        throw new FriendServiceError("invalid-status", "This request is no longer pending.");
      }
      tx.update(ref, {
        status: "cancelled" as FriendshipStatus,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

export async function removeFriend(currentUid: string, friendshipId: string): Promise<void> {
  const ref = doc(db, "friendships", friendshipId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return; // already removed — nothing to do
      const data = snap.data() as Friendship;
      if (!data.participants.includes(currentUid)) {
        throw new FriendServiceError("not-participant", "You're not part of this friendship.");
      }
      if (data.status !== "accepted") {
        throw new FriendServiceError("invalid-status", "This isn't an active friendship.");
      }
      tx.delete(ref);
    });
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

// ── Queries ────────────────────────────────────────────────────────────────────

/** Shared by searchUserByUsername and getUserCard — resolves the friendship relationship (and its doc id, if any) between currentUid and an already-known profile. */
async function resolveRelationship(
  currentUid: string,
  profile: PublicProfile
): Promise<{ relationship: FriendRelationshipStatus; friendshipId: string | null }> {
  if (profile.uid === currentUid) return { relationship: "self", friendshipId: null };

  const pairId = generateFriendshipPairId(currentUid, profile.uid);
  const friendshipSnap = await getDoc(doc(db, "friendships", pairId));
  if (!friendshipSnap.exists()) return { relationship: "none", friendshipId: null };

  const friendship = friendshipSnap.data() as Friendship;
  let relationship: FriendRelationshipStatus;
  switch (friendship.status) {
    case "accepted":
      relationship = "friends";
      break;
    case "pending":
      relationship = friendship.requestedBy === currentUid ? "outgoing_pending" : "incoming_pending";
      break;
    case "declined":
      relationship = "declined";
      break;
    case "cancelled":
      relationship = "cancelled";
      break;
    default:
      relationship = "none";
  }
  return { relationship, friendshipId: pairId };
}

export async function searchUserByUsername(
  currentUid: string,
  rawQuery: string
): Promise<FriendSearchResult | null> {
  const normalized = normalizeUsername(rawQuery);
  if (!normalized) throw new FriendServiceError("invalid-query", "Enter a username to search.");

  try {
    const q = query(
      collection(db, "publicProfiles"),
      where("usernameNormalized", "==", normalized),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    const profile = normalizePublicProfile(docSnap.id, docSnap.data());
    const { relationship, friendshipId } = await resolveRelationship(currentUid, profile);
    return { profile, relationship, friendshipId };
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

/** Same shape as searchUserByUsername, but looked up by a known uid — used by UserCardSheet, which is opened from a uid the caller already has (a post's authorId, a chat message's author, a leaderboard entry, ...), never a username search. */
export async function getUserCard(currentUid: string, targetUid: string): Promise<FriendSearchResult | null> {
  try {
    const snap = await getDoc(doc(db, "publicProfiles", targetUid));
    if (!snap.exists()) return null;
    const profile = normalizePublicProfile(snap.id, snap.data());
    const { relationship, friendshipId } = await resolveRelationship(currentUid, profile);
    return { profile, relationship, friendshipId };
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
    throw mapFirestoreError(e);
  }
}

/**
 * "People you may know" — a bounded, ranked slice of real registered users
 * (publicProfiles), never the whole collection. Candidates come from one
 * page ordered by usernameNormalized (pageSize*4, a fixed bound — not "every
 * user"), filtered client-side against excludeUids (self, existing friends,
 * anyone with a pending request either direction — Firestore's `not-in` caps
 * out at 10 values, too small for a real friends list, so this is the
 * practical alternative for a small/medium user base), then ranked by shared
 * hobbies (weighted higher) and same city — the only two signals actually
 * available and real here. Mutual-friend-count ranking was deliberately left
 * out: friendships/{pairId}'s read rule is participant-only (by design, so
 * one user can't enumerate a stranger's friend list), so this client has no
 * way to read a third party's friendships to compute a real mutual count
 * without weakening that privacy rule.
 */
export async function fetchFriendRecommendations(
  currentUid: string,
  excludeUids: Set<string>,
  myHobbies: string[],
  myCity: string,
  pageSize = 12
): Promise<PublicProfile[]> {
  try {
    const q = query(collection(db, "publicProfiles"), orderBy("usernameNormalized"), limit(pageSize * 4));
    const snap = await getDocs(q);
    const candidates = snap.docs.map((d) => normalizePublicProfile(d.id, d.data()));
    return rankFriendRecommendations(candidates, currentUid, excludeUids, myHobbies, myCity, pageSize);
  } catch (e) {
    throw mapFirestoreError(e);
  }
}

export function subscribeToAcceptedFriendships(
  uid: string,
  onChange: (friendships: Friendship[]) => void,
  onError?: (error: FriendServiceError) => void
): Unsubscribe {
  const q = query(
    collection(db, "friendships"),
    where("participants", "array-contains", uid),
    where("status", "==", "accepted")
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Friendship))),
    (err) => onError?.(mapFirestoreError(err))
  );
}

export function subscribeToIncomingRequests(
  uid: string,
  onChange: (friendships: Friendship[]) => void,
  onError?: (error: FriendServiceError) => void
): Unsubscribe {
  const q = query(
    collection(db, "friendships"),
    where("requestedTo", "==", uid),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Friendship))),
    (err) => onError?.(mapFirestoreError(err))
  );
}

export function subscribeToOutgoingRequests(
  uid: string,
  onChange: (friendships: Friendship[]) => void,
  onError?: (error: FriendServiceError) => void
): Unsubscribe {
  const q = query(
    collection(db, "friendships"),
    where("requestedBy", "==", uid),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Friendship))),
    (err) => onError?.(mapFirestoreError(err))
  );
}

/** Fetches publicProfiles for the given UIDs, chunked into groups of 10 (Firestore `in` limit-safe), deduplicated by uid. */
export async function fetchPublicProfilesByIds(uids: string[]): Promise<Map<string, PublicProfile>> {
  const unique = Array.from(new Set(uids)).filter((id): id is string => Boolean(id));
  const result = new Map<string, PublicProfile>();
  if (unique.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10));
  }

  try {
    await Promise.all(
      chunks.map(async (chunk) => {
        const q = query(collection(db, "publicProfiles"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          result.set(d.id, normalizePublicProfile(d.id, d.data()));
        });
      })
    );
  } catch (e) {
    throw mapFirestoreError(e);
  }

  return result;
}
