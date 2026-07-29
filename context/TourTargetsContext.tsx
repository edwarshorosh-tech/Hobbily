/**
 * TourTargetsContext — a plain registry mapping a stable id to whichever
 * on-screen element currently wants to be spotlight-able by
 * components/OnboardingTour.tsx (the post-signup coachmark tour). Any
 * component anywhere in the tree can claim an id via useTourTarget(id); the
 * tour later resolves that id to a live screen position via measureTarget.
 *
 * Deliberately NOT a map of refs to positions — components mount/unmount/
 * re-layout constantly (tab screens lazy-mount, ScrollViews reflow), so the
 * registry only ever holds the live node handle. Position is resolved lazily,
 * on demand, at the exact moment the tour needs it.
 *
 * Also registers each screen's own scrollable container (useTourScrollRoot) —
 * a target can be scrolled out of view (e.g. Home's Friends Leaderboard below
 * the fold on a short device), and the tour needs to be able to scroll it back
 * into the viewport before spotlighting it. Same measure-relative-to-container
 * + current-offset-tracking-via-onScroll approach as focusFriendsAnchor,
 * generalized so any screen can register once and any tour step can ask to be
 * scrolled into view.
 *
 * Measurement history, in order actually tried against this app:
 *  1. measureInWindow alone (raw window/absolute coordinates). Landed the
 *     spotlight box offset on Android by roughly the status bar's height.
 *  2. measureInWindow with a hand-subtracted StatusBar.currentHeight. Made it
 *     *worse* on real devices, confirmed on-device — the box landed even
 *     further from the target, i.e. this was over-correcting, not correcting.
 *  3. measureLayout against the tour overlay's own anchor view (a plain View
 *     the overlay mounts at its absolute-fill root — OnboardingTour's
 *     overlayAnchorRef), on the theory that diffing two same-primitive
 *     measurements cancels any constant offset automatically without needing
 *     to name what that offset even is. Sound in principle, but confirmed via
 *     __DEV__ logging that measureLayout was silently failing on the actual
 *     test device (falling back to plain measureInWindow every time) — this
 *     app's New Architecture (Fabric) config already has one documented
 *     measureLayout failure (app/(tabs)/profile.tsx's focusFriendsAnchor,
 *     "ref.measureLayout must be called with a ref to a native component"),
 *     and evidently isn't reliable enough here to depend on either.
 *
 * What's actually used now: the same cancel-the-offset idea as attempt 3, but
 * built on measureInWindow (proven reliable in this app, e.g. that same
 * focusFriendsAnchor) instead of the flakier measureLayout — measure both the
 * target and the overlay's anchor view via measureInWindow, then subtract:
 * `{ x: targetX - anchorX, y: targetY - anchorY }`. Both measurements come
 * from the same primitive, in the same absolute-window coordinate space, so
 * any constant offset between that space and the overlay's own local
 * rendering space (status bar, safe-area inset, whatever it actually is)
 * cancels out of the subtraction without ever having to be named or
 * hand-corrected — no Platform.OS branches, no StatusBar import, anywhere in
 * this file.
 */
import { createContext, useCallback, useContext, useRef } from "react";

export type TourTargetId =
  | "aiAssistant"
  | "addFriends"
  | "plannerAddActivity"
  | "communityTab"
  | "exploreTab";

/** A screen's own scrollable root, keyed by which screen it belongs to — distinct from TourTargetId since it's a container, not a spotlight-able element itself. */
export type TourScrollRootId = "home" | "planner";

export type TourTargetRect = { x: number; y: number; width: number; height: number };

/** Minimal shape actually needed — real View/Pressable/ScrollView instances all implement this at runtime even where their TS types don't declare it. */
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

/** The tour overlay's own anchor view (see OnboardingTour's overlayAnchorRef) — every rect below is measured relative to this. Just a Measurable like any target; split out as its own alias purely for readability at call sites. */
type MeasureContainer = Measurable | null;

type ScrollRootHandle = {
  node: Measurable & { scrollTo: (options: { y: number; animated: boolean }) => void };
  /** Reads the screen's own live-tracked content offset (see useTourScrollRoot's onScroll) — RN has no synchronous "current offset" getter, so this can't be derived any other way. */
  getOffset: () => number;
};

/**
 * Resolves `node`'s rect relative to `container` by measureInWindow-ing both
 * and subtracting — see file header for why a manual diff, not measureLayout.
 * Resolves null if `container` isn't mounted yet, or `node` reports a zero
 * size (not yet laid out).
 */
function measureRelative(
  node: Measurable,
  container: MeasureContainer,
  resolve: (rect: TourTargetRect | null) => void
) {
  if (!container) {
    resolve(null);
    return;
  }
  node.measureInWindow((nodeX, nodeY, width, height) => {
    if (width <= 0 || height <= 0) {
      resolve(null);
      return;
    }
    container.measureInWindow((containerX, containerY) => {
      resolve({ x: nodeX - containerX, y: nodeY - containerY, width, height });
    });
  });
}

type TourTargetsContextType = {
  registerTarget: (id: TourTargetId, node: Measurable | null) => void;
  /** Resolves null if the target isn't currently registered, or reports a zero size (not yet laid out). `container` is the tour overlay's anchor view — see MeasureContainer. */
  measureTarget: (id: TourTargetId, container: MeasureContainer) => Promise<TourTargetRect | null>;
  registerScrollRoot: (id: TourScrollRootId, handle: ScrollRootHandle | null) => void;
  /** Resolves null if no screen has registered this scroll root right now (e.g. navigated away). */
  measureScrollRoot: (id: TourScrollRootId, container: MeasureContainer) => Promise<TourTargetRect | null>;
  /** Scrolls the registered root by a delta computed against its own last-known offset; no-ops if unregistered. */
  scrollRootBy: (id: TourScrollRootId, deltaY: number) => void;
};

const TourTargetsContext = createContext<TourTargetsContextType | undefined>(undefined);

export function TourTargetsProvider({ children }: { children: React.ReactNode }) {
  const nodes = useRef<Partial<Record<TourTargetId, Measurable>>>({});
  const scrollRoots = useRef<Partial<Record<TourScrollRootId, ScrollRootHandle>>>({});

  const registerTarget = useCallback((id: TourTargetId, node: Measurable | null) => {
    if (node) nodes.current[id] = node;
    else delete nodes.current[id];
  }, []);

  const measureTarget = useCallback((id: TourTargetId, container: MeasureContainer): Promise<TourTargetRect | null> => {
    return new Promise((resolve) => {
      const node = nodes.current[id];
      if (!node) {
        resolve(null);
        return;
      }
      measureRelative(node, container, resolve);
    });
  }, []);

  const registerScrollRoot = useCallback((id: TourScrollRootId, handle: ScrollRootHandle | null) => {
    if (handle) scrollRoots.current[id] = handle;
    else delete scrollRoots.current[id];
  }, []);

  const measureScrollRoot = useCallback((id: TourScrollRootId, container: MeasureContainer): Promise<TourTargetRect | null> => {
    return new Promise((resolve) => {
      const root = scrollRoots.current[id];
      if (!root) {
        resolve(null);
        return;
      }
      measureRelative(root.node, container, resolve);
    });
  }, []);

  const scrollRootBy = useCallback((id: TourScrollRootId, deltaY: number) => {
    const root = scrollRoots.current[id];
    if (!root) return;
    const nextOffset = Math.max(0, root.getOffset() + deltaY);
    // Animated — the user sees the actual screen glide to bring the next
    // target into view rather than an instant jump, while the spotlight box
    // itself stays put at the previous step's position; OnboardingTour's
    // ensureVisible waits out a fixed settle delay approximating this
    // animation's duration before re-measuring and starting the box's own
    // glide, so the two motions read as one continuous handoff.
    root.node.scrollTo({ y: nextOffset, animated: true });
  }, []);

  return (
    <TourTargetsContext.Provider
      value={{ registerTarget, measureTarget, registerScrollRoot, measureScrollRoot, scrollRootBy }}
    >
      {children}
    </TourTargetsContext.Provider>
  );
}

export function useTourTargets() {
  const ctx = useContext(TourTargetsContext);
  if (!ctx) throw new Error("useTourTargets must be used inside TourTargetsProvider");
  return ctx;
}

/**
 * Returns a ref callback to attach to the element that should be spotlighted
 * for `id` — e.g. `<View ref={useTourTarget("aiAssistant")}>`. Pass `null`
 * (not a conditional hook call) when this particular instance shouldn't
 * register anything, e.g. a tab bar button whose route doesn't map to a tour
 * step — the returned callback is then a no-op, keeping the Rules of Hooks
 * satisfied at every call site.
 */
export function useTourTarget(id: TourTargetId | null) {
  const { registerTarget } = useTourTargets();
  return useCallback(
    (node: Measurable | null) => {
      if (!id) return;
      registerTarget(id, node);
    },
    [registerTarget, id]
  );
}

/**
 * Registers a screen's own outer ScrollView as a named scroll root the tour
 * can scroll on demand. Attach both returned pieces to the same ScrollView:
 * `<ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16}>`.
 * scrollEventThrottle is required — without frequent onScroll callbacks the
 * tracked offset can be stale by the time the tour reads it.
 */
export function useTourScrollRoot(id: TourScrollRootId) {
  const { registerScrollRoot } = useTourTargets();
  const offsetRef = useRef(0);

  // ScrollView's own ref type doesn't declare measureInWindow/scrollTo (same
  // gap noted in app/(tabs)/profile.tsx's focusFriendsAnchor) even though it
  // implements both at runtime — accept the real instance loosely typed and
  // store it as the shape this context actually calls.
  const ref = useCallback(
    (node: unknown) => {
      registerScrollRoot(id, node ? { node: node as ScrollRootHandle["node"], getOffset: () => offsetRef.current } : null);
    },
    [registerScrollRoot, id]
  );

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { ref, onScroll };
}
