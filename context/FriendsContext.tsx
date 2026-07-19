/**
 * FriendsContext
 * Single source of truth for the friends feature's real-time state:
 * accepted friendships, incoming/outgoing pending requests, and the
 * publicProfiles resolved for everyone involved. Profile and Home both
 * read from this context instead of running their own Firestore queries,
 * so there is exactly one set of friendship listeners per session.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useProfile } from "./ProfileContext";
import { Friendship } from "../types/Friendship";
import { PublicProfile } from "../types/PublicProfile";
import {
  FriendSearchResult,
  FriendServiceError,
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendRequest,
  declineFriendRequest,
  fetchPublicProfilesByIds,
  removeFriend,
  searchUserByUsername,
  subscribeToAcceptedFriendships,
  subscribeToIncomingRequests,
  subscribeToOutgoingRequests,
} from "../services/friendsService";

export type AsyncActionState = "idle" | "loading" | "error";

export type FriendRequestViewModel = {
  friendshipId: string;
  direction: "incoming" | "outgoing";
  otherUid: string;
  /** null when the profile could not be resolved (deleted/missing) — render defensively, don't crash. */
  profile: PublicProfile | null;
};

export type FriendActionResult = { ok: true } | { ok: false; message: string };

type FriendsContextType = {
  isLoaded: boolean;
  loadError: string | null;
  acceptedFriends: PublicProfile[];
  incomingRequests: FriendRequestViewModel[];
  outgoingRequests: FriendRequestViewModel[];
  actionState: Record<string, AsyncActionState>;
  sendRequest: (targetUid: string) => Promise<FriendActionResult>;
  acceptRequest: (friendshipId: string) => Promise<FriendActionResult>;
  declineRequest: (friendshipId: string) => Promise<FriendActionResult>;
  cancelRequest: (friendshipId: string) => Promise<FriendActionResult>;
  removeFriendship: (friendshipId: string) => Promise<FriendActionResult>;
  searchUsername: (rawQuery: string) => Promise<FriendSearchResult | null>;
  refreshFriendProfiles: () => void;
};

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

/** User-facing copy for service error codes — never surface raw Firebase errors. */
export function friendlyMessage(e: unknown): string {
  if (e instanceof FriendServiceError) {
    switch (e.code) {
      case "self-request":
        return "You can't add yourself.";
      case "already-friends":
        return "You're already friends.";
      case "already-requested":
        return "A request is already pending.";
      case "not-found":
        return "This request no longer exists.";
      case "not-recipient":
      case "not-sender":
      case "not-participant":
        return "You can't do that for this request.";
      case "invalid-status":
        return "This request has already been handled.";
      case "invalid-query":
        return "Enter a username to search.";
      case "permission-denied":
        return "You don't have permission to do that.";
      case "network-error":
        return "Network error — please try again.";
      case "unauthenticated":
        return "Please sign in again.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const uid = user?.uid ?? null;
  const username = profile.username;

  const [acceptedRaw, setAcceptedRaw] = useState<Friendship[]>([]);
  const [incomingRaw, setIncomingRaw] = useState<Friendship[]>([]);
  const [outgoingRaw, setOutgoingRaw] = useState<Friendship[]>([]);
  const [loadedFlags, setLoadedFlags] = useState({ accepted: false, incoming: false, outgoing: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, PublicProfile>>(new Map());
  const [actionState, setActionState] = useState<Record<string, AsyncActionState>>({});

  const fetchedKeyRef = useRef<string>("");

  // ── Real-time listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setAcceptedRaw([]);
      setIncomingRaw([]);
      setOutgoingRaw([]);
      setLoadedFlags({ accepted: false, incoming: false, outgoing: false });
      setProfiles(new Map());
      fetchedKeyRef.current = "";
      return;
    }

    setLoadError(null);
    const onErr = (e: FriendServiceError) => setLoadError(friendlyMessage(e));

    const unsubAccepted = subscribeToAcceptedFriendships(
      uid,
      (list) => {
        setAcceptedRaw(list);
        setLoadedFlags((f) => ({ ...f, accepted: true }));
      },
      onErr
    );
    const unsubIncoming = subscribeToIncomingRequests(
      uid,
      (list) => {
        setIncomingRaw(list);
        setLoadedFlags((f) => ({ ...f, incoming: true }));
      },
      onErr
    );
    const unsubOutgoing = subscribeToOutgoingRequests(
      uid,
      (list) => {
        setOutgoingRaw(list);
        setLoadedFlags((f) => ({ ...f, outgoing: true }));
      },
      onErr
    );

    return () => {
      unsubAccepted();
      unsubIncoming();
      unsubOutgoing();
    };
  }, [uid]);

  // ── Resolve involved UIDs to public profiles ────────────────────────────
  const otherUid = useCallback(
    (f: Friendship): string => (f.requestedBy === uid ? f.requestedTo : f.requestedBy),
    [uid]
  );

  const neededUids = useMemo(() => {
    const set = new Set<string>();
    acceptedRaw.forEach((f) => set.add(otherUid(f)));
    incomingRaw.forEach((f) => set.add(otherUid(f)));
    outgoingRaw.forEach((f) => set.add(otherUid(f)));
    return Array.from(set).sort();
  }, [acceptedRaw, incomingRaw, outgoingRaw, otherUid]);

  useEffect(() => {
    let cancelled = false;
    const key = neededUids.join(",");
    if (key === fetchedKeyRef.current || neededUids.length === 0) {
      if (neededUids.length === 0) setProfiles(new Map());
      return;
    }
    fetchedKeyRef.current = key;
    fetchPublicProfilesByIds(neededUids)
      .then((fetched) => {
        if (cancelled) return;
        setProfiles(fetched);
      })
      .catch((e) => {
        if (cancelled) return;
        if (__DEV__) console.warn("[FriendsContext] failed to resolve public profiles", e);
      });
    return () => {
      cancelled = true;
    };
  }, [neededUids]);

  const refreshFriendProfiles = useCallback(() => {
    if (neededUids.length === 0) return;
    fetchPublicProfilesByIds(neededUids)
      .then((fetched) => setProfiles(fetched))
      .catch((e) => {
        if (__DEV__) console.warn("[FriendsContext] refresh failed", e);
      });
  }, [neededUids]);

  // ── Derived view models ──────────────────────────────────────────────────
  const acceptedFriends = useMemo<PublicProfile[]>(() => {
    return acceptedRaw
      .map((f) => profiles.get(otherUid(f)))
      .filter((p): p is PublicProfile => Boolean(p));
  }, [acceptedRaw, profiles, otherUid]);

  const incomingRequests = useMemo<FriendRequestViewModel[]>(() => {
    return incomingRaw.map((f) => ({
      friendshipId: f.id,
      direction: "incoming" as const,
      otherUid: otherUid(f),
      profile: profiles.get(otherUid(f)) ?? null,
    }));
  }, [incomingRaw, profiles, otherUid]);

  const outgoingRequests = useMemo<FriendRequestViewModel[]>(() => {
    return outgoingRaw.map((f) => ({
      friendshipId: f.id,
      direction: "outgoing" as const,
      otherUid: otherUid(f),
      profile: profiles.get(otherUid(f)) ?? null,
    }));
  }, [outgoingRaw, profiles, otherUid]);

  const isLoaded = !uid || (loadedFlags.accepted && loadedFlags.incoming && loadedFlags.outgoing);

  // ── Actions ───────────────────────────────────────────────────────────────
  const runAction = useCallback(
    async (key: string, fn: () => Promise<void>): Promise<FriendActionResult> => {
      if (actionState[key] === "loading") return { ok: false, message: "Already in progress." };
      setActionState((s) => ({ ...s, [key]: "loading" }));
      try {
        await fn();
        setActionState((s) => ({ ...s, [key]: "idle" }));
        return { ok: true };
      } catch (e) {
        setActionState((s) => ({ ...s, [key]: "error" }));
        return { ok: false, message: friendlyMessage(e) };
      }
    },
    [actionState]
  );

  const sendRequest = useCallback(
    (targetUid: string) => {
      if (!uid) return Promise.resolve<FriendActionResult>({ ok: false, message: "Please sign in again." });
      return runAction(`send:${targetUid}`, () => createFriendRequest(uid, targetUid, username));
    },
    [uid, username, runAction]
  );

  const acceptRequest = useCallback(
    (friendshipId: string) => {
      if (!uid) return Promise.resolve<FriendActionResult>({ ok: false, message: "Please sign in again." });
      return runAction(`accept:${friendshipId}`, () => acceptFriendRequest(uid, friendshipId, username));
    },
    [uid, username, runAction]
  );

  const declineRequest = useCallback(
    (friendshipId: string) => {
      if (!uid) return Promise.resolve<FriendActionResult>({ ok: false, message: "Please sign in again." });
      return runAction(`decline:${friendshipId}`, () => declineFriendRequest(uid, friendshipId));
    },
    [uid, runAction]
  );

  const cancelRequest = useCallback(
    (friendshipId: string) => {
      if (!uid) return Promise.resolve<FriendActionResult>({ ok: false, message: "Please sign in again." });
      return runAction(`cancel:${friendshipId}`, () => cancelFriendRequest(uid, friendshipId));
    },
    [uid, runAction]
  );

  const removeFriendship = useCallback(
    (friendshipId: string) => {
      if (!uid) return Promise.resolve<FriendActionResult>({ ok: false, message: "Please sign in again." });
      return runAction(`remove:${friendshipId}`, () => removeFriend(uid, friendshipId));
    },
    [uid, runAction]
  );

  const searchUsername = useCallback(
    (rawQuery: string) => {
      if (!uid) return Promise.resolve(null);
      return searchUserByUsername(uid, rawQuery);
    },
    [uid]
  );

  const value: FriendsContextType = {
    isLoaded,
    loadError,
    acceptedFriends,
    incomingRequests,
    outgoingRequests,
    actionState,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriendship,
    searchUsername,
    refreshFriendProfiles,
  };

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error("useFriends must be used inside FriendsProvider");
  return ctx;
}
