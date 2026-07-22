/**
 * Pure ranking logic for "People You May Know" (FriendSearchModal's
 * PeopleYouMayKnow section) — split out of services/friendsService.ts's
 * fetchFriendRecommendations so it's independently unit-testable without a
 * live Firestore connection. friendsService.ts can't be imported directly in
 * this project's Jest suite: it (transitively, via lib/firebase.ts) pulls in
 * `firebase/app`'s ESM build, which Jest's default transform can't parse —
 * every existing test in __tests__/ already avoids that whole import chain
 * for the same reason. fetchFriendRecommendations fetches the raw candidate
 * page from publicProfiles and hands it to rankFriendRecommendations
 * unchanged; this module has no Firebase import at all.
 */
import { PublicProfile } from "../types/PublicProfile";

/** Higher score = better match: 2 points per shared hobby, 1 point for living in the same city. */
export function scoreRecommendation(
  profile: Pick<PublicProfile, "hobbies" | "city">,
  myHobbiesLower: Set<string>,
  myCityLower: string
): number {
  const sharedHobbies = profile.hobbies.filter((h) => myHobbiesLower.has(h.toLowerCase())).length;
  const sameCity = myCityLower.length > 0 && profile.city.trim().toLowerCase() === myCityLower ? 1 : 0;
  return sharedHobbies * 2 + sameCity;
}

/**
 * Excludes the current user and anyone in excludeUids (the caller decides
 * what belongs there — accepted friends, incoming/outgoing pending requests
 * all go in today), scores the remaining candidates, sorts best-match-first
 * (ties broken by the candidates' own relative order, via a stable sort), and
 * caps the result at pageSize.
 */
export function rankFriendRecommendations(
  candidates: PublicProfile[],
  currentUid: string,
  excludeUids: ReadonlySet<string>,
  myHobbies: string[],
  myCity: string,
  pageSize: number
): PublicProfile[] {
  const myHobbiesLower = new Set(myHobbies.map((h) => h.toLowerCase()));
  const myCityLower = myCity.trim().toLowerCase();

  const eligible = candidates.filter((p) => p.uid !== currentUid && !excludeUids.has(p.uid));
  const scored = eligible.map((profile) => ({ profile, score: scoreRecommendation(profile, myHobbiesLower, myCityLower) }));
  // Array.prototype.sort is stable per spec (Node/Hermes both implement ES2019+) —
  // candidates with equal scores keep the order the query returned them in.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, pageSize).map((s) => s.profile);
}
