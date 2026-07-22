/**
 * useUserProfileSheet is the one shared "which user's profile sheet is open"
 * controller — every real UserCardSheet caller (Friends section, community
 * chat, member lists, leaderboard, posts/comments, workshop participants,
 * FriendSearchModal) uses it instead of its own local useState, precisely so
 * closing a sheet is expressed the same stable way everywhere (see Stage 1's
 * "clear selectedUserId only after dismissal, never navigate, never
 * invalidate unrelated queries" requirement). This exercises the hook
 * itself — not a mock of it — via a real render + act(), the standard way to
 * test a hook without adding @testing-library/react-hooks as a new
 * dependency (react-test-renderer already ships transitively via jest-expo).
 */
import React from "react";
import { act, create } from "react-test-renderer";
import { useUserProfileSheet } from "../hooks/useUserProfileSheet";

type Hook = ReturnType<typeof useUserProfileSheet>;

function renderUserProfileSheetHook(): { result: { current: Hook } } {
  const result = { current: undefined as unknown as Hook };
  function Probe() {
    result.current = useUserProfileSheet();
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  return { result };
}

describe("useUserProfileSheet", () => {
  it("starts closed", () => {
    const { result } = renderUserProfileSheetHook();
    expect(result.current.selectedUid).toBeNull();
  });

  it("openUserProfile sets selectedUid, closeUserProfile clears it back to null", () => {
    const { result } = renderUserProfileSheetHook();

    act(() => {
      result.current.openUserProfile("friend-uid-1");
    });
    expect(result.current.selectedUid).toBe("friend-uid-1");

    act(() => {
      result.current.closeUserProfile();
    });
    expect(result.current.selectedUid).toBeNull();
  });

  it("ignores an empty or whitespace-only uid instead of opening the sheet with nothing to load", () => {
    const { result } = renderUserProfileSheetHook();

    act(() => {
      result.current.openUserProfile("");
    });
    expect(result.current.selectedUid).toBeNull();

    act(() => {
      result.current.openUserProfile("   ");
    });
    expect(result.current.selectedUid).toBeNull();
  });

  it("opening a different uid while already open just swaps selectedUid (no stale intermediate close)", () => {
    const { result } = renderUserProfileSheetHook();

    act(() => {
      result.current.openUserProfile("friend-uid-1");
    });
    act(() => {
      result.current.openUserProfile("friend-uid-2");
    });
    expect(result.current.selectedUid).toBe("friend-uid-2");
  });

  it("openUserProfile/closeUserProfile keep a stable identity across renders", () => {
    // Safe to pass straight into a memoized FlatList renderItem/child (e.g.
    // OpportunityCard, RecommendationRow) without invalidating memoization
    // on every unrelated parent re-render.
    const { result } = renderUserProfileSheetHook();
    const openRef = result.current.openUserProfile;
    const closeRef = result.current.closeUserProfile;

    act(() => {
      result.current.openUserProfile("friend-uid-1");
    });

    expect(result.current.openUserProfile).toBe(openRef);
    expect(result.current.closeUserProfile).toBe(closeRef);
  });
});
