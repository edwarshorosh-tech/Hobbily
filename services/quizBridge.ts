/**
 * One-shot handoff for the hobby picked at the end of the Hidden Hobbies Quiz
 * when launched from onboarding's Interests step.
 *
 * Passing it as a route param instead would force onboarding's screen instance to
 * remount on return (losing its in-progress `step` and form state), since
 * expo-router treats a navigation to the same path with different params as a new
 * screen rather than popping back to the existing one. router.back() pops to the
 * exact existing instance, so this module hands the value across that pop instead.
 */
// Not scoped to a user/session — it's a bare module-level value that persists
// for the life of the JS runtime. On a shared device where the app isn't
// reloaded between accounts, a hobby set here but never consumed (e.g. the
// session is abandoned right after tapping "Add & Continue", before
// onboarding's focus effect fires) could be picked up by a different user's
// unrelated onboarding session later. Acceptable given this bridge's narrow,
// single-session purpose (see file header) — revisit if that assumption ever
// changes.
let pendingHobby: string | null = null;

export function setPendingQuizHobby(hobby: string) {
  pendingHobby = hobby;
}

export function takePendingQuizHobby(): string | null {
  const hobby = pendingHobby;
  pendingHobby = null;
  return hobby;
}
