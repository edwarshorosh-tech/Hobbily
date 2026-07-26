import { commitDistanceFor, nextArmedState, resistedTranslation, resolveEdgeZoneSide, shouldCommitSwipe, resolveAdjacentTabIndex } from "../utils/edgeSwipe";

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

describe("commitDistanceFor", () => {
  const MIN = 72;
  const MAX = 104;

  it("uses 22% of container width when that falls within [min, max]", () => {
    expect(commitDistanceFor(400, MIN, MAX)).toBeCloseTo(88);
  });

  it("clamps to the minimum on a very narrow (320px) screen", () => {
    expect(commitDistanceFor(320, MIN, MAX)).toBe(MIN);
  });

  it("clamps to the maximum on a very wide (tablet) screen", () => {
    expect(commitDistanceFor(1200, MIN, MAX)).toBe(MAX);
  });
});

describe("resistedTranslation", () => {
  const WIDTH = 400;

  it("dampens the raw translation to 28% while under the width cap", () => {
    expect(resistedTranslation(100, WIDTH)).toBeCloseTo(28);
  });

  it("caps the resisted distance at 16% of container width for a very large drag", () => {
    expect(resistedTranslation(1000, WIDTH)).toBeCloseTo(64); // 16% of 400
  });

  it("preserves sign for a leftward (negative) drag", () => {
    expect(resistedTranslation(-100, WIDTH)).toBeCloseTo(-28);
  });

  it("never tracks the finger 1:1 for any nonzero drag", () => {
    expect(Math.abs(resistedTranslation(50, WIDTH))).toBeLessThan(50);
  });
});

describe("nextArmedState", () => {
  it("arms once pull reaches the full threshold", () => {
    expect(nextArmedState(1, 0, 0.88)).toBe(1);
  });

  it("stays armed inside the hysteresis band (between disarmBelow and 1)", () => {
    expect(nextArmedState(0.92, 1, 0.88)).toBe(1);
  });

  it("disarms once pull drops below the disarm threshold", () => {
    expect(nextArmedState(0.5, 1, 0.88)).toBe(0);
  });

  it("does not arm early — below 1, from an unarmed state, stays unarmed even inside the band", () => {
    expect(nextArmedState(0.92, 0, 0.88)).toBe(0);
  });

  it("armed state is stable at exactly the disarm boundary", () => {
    expect(nextArmedState(0.88, 1, 0.88)).toBe(1);
  });
});
