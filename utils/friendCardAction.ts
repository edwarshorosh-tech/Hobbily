/**
 * Pure friend-relationship -> UserCardSheet primary-action mapping. Kept out
 * of components/user-card/UserCardSheet.tsx (which pulls in context/
 * FriendsContext.tsx -> lib/firebase.ts's real Firebase initialization) so
 * this state-machine-shaped mapping is independently unit-testable.
 */
import type { FriendRelationshipStatus } from "../services/friendsService";

export type FriendCardActionKind = "add" | "requested" | "accept" | "friends" | "self";

export function actionFor(relationship: FriendRelationshipStatus): { label: string; kind: FriendCardActionKind } {
  switch (relationship) {
    case "self":
      return { label: "This is you", kind: "self" };
    case "friends":
      return { label: "Friends", kind: "friends" };
    case "outgoing_pending":
      return { label: "Requested", kind: "requested" };
    case "incoming_pending":
      return { label: "Accept Request", kind: "accept" };
    default:
      return { label: "Add Friend", kind: "add" };
  }
}
