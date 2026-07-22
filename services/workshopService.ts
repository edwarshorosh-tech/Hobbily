/**
 * workshopService — Firestore I/O for real workshop/opportunity
 * participation (workshopParticipants/{workshopId}_{uid}). The opportunity
 * catalog itself (app/(tabs)/opportunities.tsx's OPPORTUNITIES array) stays
 * static app content — this is only the *participation* records, which is
 * genuinely multi-user data and has to be real and shared.
 */
import { db } from "../lib/firebase";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, Unsubscribe } from "firebase/firestore";
import { WorkshopParticipant } from "../types/Workshop";
import { mapFirebaseError } from "./firebaseErrors";

export type WorkshopServiceErrorCode = "permission-denied" | "network-error" | "unknown";

export class WorkshopServiceError extends Error {
  code: WorkshopServiceErrorCode;
  constructor(code: WorkshopServiceErrorCode, message: string) {
    super(message);
    this.name = "WorkshopServiceError";
    this.code = code;
  }
}

function mapError(e: unknown): WorkshopServiceError {
  const { code, message } = mapFirebaseError(e, "workshopService");
  return new WorkshopServiceError(code, message);
}

function participantId(workshopId: string, uid: string): string {
  return `${workshopId}_${uid}`;
}

/** Joins a workshop. Idempotent — joining one you're already in just re-writes the same doc, never creates a duplicate. */
export async function joinWorkshop(workshopId: string, uid: string, username: string): Promise<void> {
  try {
    await setDoc(doc(db, "workshopParticipants", participantId(workshopId, uid)), {
      workshopId,
      uid,
      username,
      status: "joined",
      joinedAt: new Date().toISOString(),
    });
  } catch (e) {
    throw mapError(e);
  }
}

/** Leaves a workshop. Idempotent — leaving one you're not in is a no-op, not an error. */
export async function leaveWorkshop(workshopId: string, uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "workshopParticipants", participantId(workshopId, uid)));
  } catch (e) {
    if ((e as { code?: string })?.code?.includes("not-found")) return;
    throw mapError(e);
  }
}

/** Live-subscribes to every workshop the given user has joined — powers "your joined workshops" (own profile, Planner-adjacent surfaces). */
export function subscribeToMyWorkshops(
  uid: string,
  onChange: (participants: WorkshopParticipant[]) => void,
  onError?: (e: WorkshopServiceError) => void
): Unsubscribe {
  const q = query(collection(db, "workshopParticipants"), where("uid", "==", uid));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkshopParticipant))),
    (err) => onError?.(mapError(err))
  );
}

/** One-shot check of whether a single user joined a single workshop — used by Public Profile's Workshops tab and UserCardSheet's preview, where a live listener per card would be excessive. */
export async function fetchUserWorkshops(uid: string): Promise<WorkshopParticipant[]> {
  try {
    const q = query(collection(db, "workshopParticipants"), where("uid", "==", uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkshopParticipant));
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * "Which of my friends joined which workshops" in one bounded batch — never
 * one query per friend. Chunks friendUids into groups of 10 (Firestore's
 * `in` cap, same chunking pattern as fetchPublicProfilesByIds) and filters
 * only on `uid` — every workshopParticipants doc is always status:"joined"
 * by construction (firestore.rules only allows creating one with that
 * status), so a second equality filter on `status` is intentionally
 * skipped here: adding it would turn this into a 2-field compound query
 * requiring a new composite index that isn't declared/deployed, for a
 * filter that can never actually exclude anything.
 */
export async function fetchFriendWorkshopParticipants(friendUids: string[]): Promise<Map<string, string[]>> {
  const byWorkshop = new Map<string, string[]>();
  const unique = Array.from(new Set(friendUids)).filter((id): id is string => Boolean(id));
  if (unique.length === 0) return byWorkshop;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10));
  }

  try {
    await Promise.all(
      chunks.map(async (chunk) => {
        const q = query(collection(db, "workshopParticipants"), where("uid", "in", chunk));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as WorkshopParticipant;
          const existing = byWorkshop.get(data.workshopId) ?? [];
          existing.push(data.uid);
          byWorkshop.set(data.workshopId, existing);
        });
      })
    );
  } catch (e) {
    throw mapError(e);
  }

  return byWorkshop;
}
