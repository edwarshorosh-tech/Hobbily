/**
 * mvpRegistrationNoticeCopy — single source of copy for the "registration
 * isn't live yet" notice every Explore registration entry point shows while
 * FEATURE_FLAGS.exploreRegistrationEnabled is false (see
 * constants/featureFlags.ts). One function so the wording can't drift
 * between call sites — there is currently one (the workshop Detail sheet's
 * Register button in app/(tabs)/opportunities.tsx), but this stays the
 * single place to add copy for a future one (join/book/apply) rather than
 * inlining a duplicate string.
 */
export type MvpNoticeKind = "register" | "interest";

export function mvpRegistrationNoticeCopy(kind: MvpNoticeKind = "register"): { title: string; message: string } {
  return {
    title: "Coming soon",
    message:
      kind === "interest"
        ? "Interest registration is not available in this MVP version yet. This feature will be added in a future version."
        : "Registration is not available in this MVP version yet. This workshop is shown as an example of the future Explore experience.",
  };
}
