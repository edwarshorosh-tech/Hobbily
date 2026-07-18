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
let pendingHobby: string | null = null;

export function setPendingQuizHobby(hobby: string) {
  pendingHobby = hobby;
}

export function takePendingQuizHobby(): string | null {
  const hobby = pendingHobby;
  pendingHobby = null;
  return hobby;
}
