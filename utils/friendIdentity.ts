/**
 * Pure identity helpers for the friends feature, kept separate from
 * services/friendsService.ts (which re-exports both) so they can be
 * unit-tested without pulling in lib/firebase.ts's real Firebase
 * initialization — services/friendsService.ts imports firebase/firestore
 * and lib/firebase.ts at module load, which a plain Jest unit test should
 * never need to trigger just to check a string-normalization rule.
 */

/** Trims, lowercases — the single normalization rule used both on save and search. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Deterministic doc id for a pair of UIDs: the two UIDs sorted, joined with "_". */
export function generateFriendshipPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}
