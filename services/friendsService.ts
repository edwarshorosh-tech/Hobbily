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
  const code = (e as { code?: string } | null)?.code;
  if (code === "permission-denied") {
    return new FriendServiceError("permission-denied", "You don't have permission to do that.");
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "cancelled") {
    return new FriendServiceError("network-error", "Network error — please try again.");
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn("[friendsService]", e);
  }
  return new FriendServiceError("unknown", "Something went wrong. Please try again.");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Trims, lowercases — the single normalization rule used both on save and search. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Deterministic doc id for a pair of UIDs: the two UIDs sorted, joined with "_". */
export function generateFriendshipPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
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
    const profile = { uid: docSnap.id, ...docSnap.data() } as PublicProfile;

    if (profile.uid === currentUid) {
      return { profile, relationship: "self", friendshipId: null };
    }

    const pairId = generateFriendshipPairId(currentUid, profile.uid);
    const friendshipSnap = await getDoc(doc(db, "friendships", pairId));
    if (!friendshipSnap.exists()) {
      return { profile, relationship: "none", friendshipId: null };
    }

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
    return { profile, relationship, friendshipId: pairId };
  } catch (e) {
    if (e instanceof FriendServiceError) throw e;
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
          result.set(d.id, { uid: d.id, ...d.data() } as PublicProfile);
        });
      })
    );
  } catch (e) {
    throw mapFirestoreError(e);
  }

  return result;
}
