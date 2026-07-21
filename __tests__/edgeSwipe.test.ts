import { resolveEdgeZoneSide, shouldCommitSwipe, resolveAdjacentTabIndex } from "../utils/edgeSwipe";

const EDGE_ZONE = 24;
const WIDTH = 400;

describe("resolveEdgeZoneSide", () => {
  it("arms the left edge for a touch within the left edge zone", () => {
    expect(resolveEdgeZoneSide(10, WIDTH, EDGE_ZONE, true, true)).toBe(-1);
  });

  it("arms the right edge for a touch within the right edge zone", () => {
    expect(resolveEdgeZoneSide(WIDTH - 5, WIDTH, EDGE_ZONE, true, true)).toBe(1);
  });

  it("does not activate from the center of the screen", () => {
    expect(resolveEdgeZoneSide(WIDTH / 2, WIDTH, EDGE_ZONE, true, true)).toBe(0);
  });

  it("does not arm the left edge on the first tab (no previous tab)", () => {
    expect(resolveEdgeZoneSide(5, WIDTH, EDGE_ZONE, false, true)).toBe(0);
  });

  it("does not arm the right edge on the last tab (no next tab)", () => {
    expect(resolveEdgeZoneSide(WIDTH - 5, WIDTH, EDGE_ZONE, true, false)).toBe(0);
  });
});

describe("shouldCommitSwipe", () => {
  const COMMIT_DISTANCE = 70;
  const COMMIT_VELOCITY = 900;

  it("commits once the distance threshold is cleared", () => {
    expect(shouldCommitSwipe(80, 0, COMMIT_DISTANCE, COMMIT_VELOCITY)).toBe(true);
  });

  it("commits on a fast flick even if released short of the distance threshold", () => {
    expect(shouldCommitSwipe(20, 1200, COMMIT_DISTANCE, COMMIT_VELOCITY)).toBe(true);
  });

  it("cancels when both distance and velocity are insufficient", () => {
    expect(shouldCommitSwipe(20, 100, COMMIT_DISTANCE, COMMIT_VELOCITY)).toBe(false);
  });

  it("does not commit exactly at the threshold (strictly greater-than)", () => {
    expect(shouldCommitSwipe(COMMIT_DISTANCE, 0, COMMIT_DISTANCE, COMMIT_VELOCITY)).toBe(false);
  });
});

describe("resolveAdjacentTabIndex", () => {
  const TAB_COUNT = 5; // Home, Planner, Community, Explore, Profile

  it("maps a left-edge swipe to the previous tab", () => {
    expect(resolveAdjacentTabIndex(2, -1, TAB_COUNT)).toBe(1);
  });

  it("maps a right-edge swipe to the next tab", () => {
    expect(resolveAdjacentTabIndex(2, 1, TAB_COUNT)).toBe(3);
  });

  it("rejects a left swipe on the first tab (Home boundary)", () => {
    expect(resolveAdjacentTabIndex(0, -1, TAB_COUNT)).toBeNull();
  });

  it("rejects a right swipe on the last tab (Profile boundary)", () => {
    expect(resolveAdjacentTabIndex(TAB_COUNT - 1, 1, TAB_COUNT)).toBeNull();
  });

  it("returns null when no side is armed", () => {
    expect(resolveAdjacentTabIndex(2, 0, TAB_COUNT)).toBeNull();
  });
});
