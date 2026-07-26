/**
 * Pure decision logic for SwipeableTab's edge-swipe gesture — pulled out of
 * the gesture callbacks so the activation zone, commit threshold, and
 * adjacent-tab math are independently testable without any Reanimated/
 * Gesture Handler runtime involved. See components/SwipeableTab.tsx.
 *
 * Each function carries an explicit `'worklet'` directive: SwipeableTab
 * calls them from inside Gesture Handler's onTouchesDown/onTouchesMove/
 * onUpdate/onEnd callbacks, which run on the UI thread as Reanimated
 * worklets. A plain function imported from another module is not
 * automatically workletized just by being called from one — without this
 * directive Reanimated would either throw or (worse) silently fall back to
 * a stale/incorrect closure. The directive is an inert no-op when these are
 * called directly from plain JS (e.g. the Jest tests in
 * __tests__/edgeSwipe.test.ts), so it doesn't affect testability.
 */

/** -1 = armed from the left edge (goes to the previous tab), 1 = right edge (next tab), 0 = neither. */
export type EdgeSwipeSide = -1 | 0 | 1;

/** Whether a touch starting at `touchX` (relative to the container) arms the gesture, and from which edge. */
export function resolveEdgeZoneSide(
  touchX: number,
  containerWidth: number,
  edgeZone: number,
  hasPrev: boolean,
  hasNext: boolean
): EdgeSwipeSide {
  "worklet";
  if (touchX <= edgeZone && hasPrev) return -1;
  if (touchX >= containerWidth - edgeZone && hasNext) return 1;
  return 0;
}

/** A swipe commits once it clears either the distance threshold or the velocity threshold. */
export function shouldCommitSwipe(
  distance: number,
  velocity: number,
  commitDistance: number,
  commitVelocity: number
): boolean {
  "worklet";
  return distance > commitDistance || velocity > commitVelocity;
}

/** The real commit distance for a given container width — proportional (22% of width) but clamped so it's never uncomfortably short on a small phone or absurdly long on a tablet. */
export function commitDistanceFor(containerWidth: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, containerWidth * 0.22));
}

/**
 * Applies drag resistance so the page never tracks the finger 1:1 all the
 * way across the screen — it's allowed to move at most 28% of the raw
 * translation, capped at 16% of the container width either way.
 */
export function resistedTranslation(rawTranslationX: number, containerWidth: number): number {
  "worklet";
  const sign = rawTranslationX < 0 ? -1 : 1;
  return sign * Math.min(Math.abs(rawTranslationX) * 0.28, containerWidth * 0.16);
}

/**
 * Hysteresis-guarded armed state: arms once pull progress reaches 1, and
 * only disarms once it drops below `disarmBelow` — the gap between the two
 * is a dead zone so the armed/unarmed visual can't flicker rapidly right at
 * the boundary. `wasArmed` is the previous frame's armed state (0 or 1).
 */
export function nextArmedState(pull: number, wasArmed: number, disarmBelow: number): 0 | 1 {
  "worklet";
  if (pull >= 1) return 1;
  if (pull < disarmBelow) return 0;
  return wasArmed === 1 ? 1 : 0;
}

/** The tab index a committed swipe from `side` would land on, or null if it would cross the first/last boundary. */
export function resolveAdjacentTabIndex(currentIndex: number, side: EdgeSwipeSide, tabCount: number): number | null {
  "worklet";
  if (side === -1) return currentIndex > 0 ? currentIndex - 1 : null;
  if (side === 1) return currentIndex < tabCount - 1 ? currentIndex + 1 : null;
  return null;
}
