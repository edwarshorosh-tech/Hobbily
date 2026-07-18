import { Timestamp } from "firebase/firestore";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "cancelled";

/**
 * friendships/{pairId}
 * pairId is the two participant UIDs sorted alphabetically and joined with "_",
 * e.g. "abc123_xyz789" — guarantees exactly one document per pair (see
 * generateFriendshipPairId in services/friendsService.ts).
 */
export type Friendship = {
  id: string;
  participants: [string, string];
  requestedBy: string;
  requestedTo: string;
  status: FriendshipStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  acceptedAt: Timestamp | null;
  declinedAt: Timestamp | null;
};
