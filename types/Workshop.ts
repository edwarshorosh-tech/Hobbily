/**
 * workshopParticipants/{workshopId}_{uid} — the real, server-side record of
 * "this user joined this workshop/opportunity". workshopId is the existing
 * Opportunity.id string from app/(tabs)/opportunities.tsx (the opportunity
 * catalog itself stays static app content, like the achievement catalog or
 * quiz questions — only *participation*, which is inherently multi-user
 * social data, needs a real backend). Mirrors communityMemberships'
 * deterministic-id pattern: a repeat "join" just re-writes the same doc, so
 * it can never create a duplicate.
 */
export type WorkshopParticipant = {
  id: string;
  workshopId: string;
  uid: string;
  username: string;
  joinedAt: string;
  /** Always "joined" today — no capacity/approval flow exists for workshops (unlike community channels' pending state), but the field is kept for parity and future use. */
  status: "joined";
};
