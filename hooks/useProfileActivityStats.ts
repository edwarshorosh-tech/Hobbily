/**
 * Real, backend-backed activity counts for a profile's info grid — used by
 * both UserCardSheet's compact preview and the Public Profile screen, so
 * they never drift into two different numbers for the same uid. Works for
 * any uid (not just the signed-in user): community membership is readable
 * by any signed-in user (firestore.rules), and workshop participation the
 * same way (see services/workshopService.ts) — no privacy system currently
 * exists to restrict either, so nothing here is gated. Friends count is
 * deliberately not included: friendships/{pairId} is participant-only
 * readable by design, so a third party's friend count isn't something this
 * client can know without weakening that privacy rule.
 */
import { useEffect, useRef, useState } from "react";
import { fetchUserCommunityCount } from "../services/communityService";
import { fetchUserWorkshops } from "../services/workshopService";

export type ProfileActivityStats = {
  communityCount: number | null;
  workshopCount: number | null;
};

export function useProfileActivityStats(uid: string | null): ProfileActivityStats {
  const [communityCount, setCommunityCount] = useState<number | null>(null);
  const [workshopCount, setWorkshopCount] = useState<number | null>(null);
  // Same "don't blank on close" reasoning as UserCardSheet's own uid effect
  // — a caller like UserCardSheet keeps rendering this uid's stats through
  // its close animation, so resetting them to null here the instant uid
  // goes null would flash the grid to "…" mid-animation for no reason.
  const lastLoadedUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    if (lastLoadedUidRef.current !== uid) {
      setCommunityCount(null);
      setWorkshopCount(null);
    }

    fetchUserCommunityCount(uid)
      .then((count) => { if (!cancelled) { lastLoadedUidRef.current = uid; setCommunityCount(count); } })
      .catch(() => { if (!cancelled) setCommunityCount(0); });

    fetchUserWorkshops(uid)
      .then((list) => { if (!cancelled) setWorkshopCount(list.length); })
      .catch(() => { if (!cancelled) setWorkshopCount(0); });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { communityCount, workshopCount };
}
