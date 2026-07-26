/**
 * One-shot handoff for "this session just created a brand-new account" —
 * set in app/onboarding.tsx right after a successful signUp() (never on
 * signIn()), and consumed once by app/(tabs)/_layout.tsx on its first mount
 * after the post-signup redirect to show the OnboardingTour.
 *
 * A persisted Firestore field can't make this distinction on its own: an
 * existing account signing in for the first time on a new device would load
 * the same "tour not yet seen" default as a brand-new account, since neither
 * has hasSeenOnboardingTour set yet. This bridge captures the one moment
 * that's actually unambiguous — the live signUp() call in this session —
 * the same pattern services/quizBridge.ts uses for its own cross-screen
 * handoff, for the same reason (no reliable persisted signal exists).
 */
let justRegistered = false;

export function markJustRegistered() {
  justRegistered = true;
}

export function takeJustRegistered(): boolean {
  const value = justRegistered;
  justRegistered = false;
  return value;
}
