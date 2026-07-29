/**
 * featureFlags — centralized, build-time MVP toggles. A screen checks its
 * flag once and branches; it never hand-rolls its own "is this enabled"
 * boolean. Flipping a flag back to true is meant to restore the previous,
 * still-fully-intact production flow (nothing it gates gets deleted — see
 * exploreRegistrationEnabled's own call site in app/(tabs)/opportunities.tsx).
 */
export type FeatureFlags = {
  /**
   * Real Explore workshop/event registration (services/workshopService.ts's
   * joinWorkshop, a genuine Firestore participant record) is fully built and
   * was already working — this flag doesn't mark unfinished code. It's off
   * because, product-side, the MVP has nothing on the other end of a
   * submitted name/email yet: no organiser ever sees or acts on it. Off
   * shows a "Coming soon" notice instead of the registration form; on
   * restores the exact previous flow, unchanged.
   */
  exploreRegistrationEnabled: boolean;
};

export const FEATURE_FLAGS: FeatureFlags = {
  exploreRegistrationEnabled: false,
};
