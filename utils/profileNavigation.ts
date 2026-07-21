/**
 * Pure navigation-intent helpers for "take me to the Friends widget on
 * Profile" — used by the Home leaderboard's empty state ("Add Friends") and
 * consumed by app/(tabs)/profile.tsx. Kept as plain functions (no Expo
 * Router import) so the *intent* — which route, which internal tab, which
 * section — is independently testable without mounting the router.
 */

export const PROFILE_FRIENDS_TAB = "overview";
export const PROFILE_FOCUS_FRIENDS = "friends";

export type ProfileFriendsTarget = {
  pathname: "/(tabs)/profile";
  params: { tab: typeof PROFILE_FRIENDS_TAB; focus: typeof PROFILE_FOCUS_FRIENDS };
};

/** The route + params the empty leaderboard's "Add Friends" action should navigate to. */
export function friendsWidgetProfileTarget(): ProfileFriendsTarget {
  return { pathname: "/(tabs)/profile", params: { tab: PROFILE_FRIENDS_TAB, focus: PROFILE_FOCUS_FRIENDS } };
}

/** Whether a `focus` search param (possibly absent, possibly a stale/unrelated value) should trigger scrolling to and highlighting the Friends widget. */
export function shouldFocusFriendsWidget(focusParam: string | string[] | undefined): boolean {
  return focusParam === PROFILE_FOCUS_FRIENDS;
}
