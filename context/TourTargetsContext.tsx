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
 * measureInWindow (not measureLayout) is used deliberately — this app's New
 * Architecture (Fabric) config throws "ref.measureLayout must be called with
 * a ref to a native component" against some ref shapes (see the near-identical
 * problem already solved in app/(tabs)/profile.tsx's focusFriendsAnchor).
 * measureInWindow reports a component's absolute on-screen position with no
 * relative-ref argument, so it never hits that check.
 */
import { createContext, useCallback, useContext, useRef } from "react";
import { View } from "react-native";

export type TourTargetId =
  | "aiAssistant"
  | "addFriends"
  | "plannerAddActivity"
  | "communityTab"
  | "exploreTab";

export type TourTargetRect = { x: number; y: number; width: number; height: number };

/** Minimal shape actually needed — real View/Pressable/ScrollView instances all implement this at runtime even where their TS types don't declare it. */
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

type TourTargetsContextType = {
  registerTarget: (id: TourTargetId, node: Measurable | null) => void;
  /** Resolves null if the target isn't currently registered, or reports a zero size (not yet laid out). */
  measureTarget: (id: TourTargetId) => Promise<TourTargetRect | null>;
};

const TourTargetsContext = createContext<TourTargetsContextType | undefined>(undefined);

export function TourTargetsProvider({ children }: { children: React.ReactNode }) {
  const nodes = useRef<Partial<Record<TourTargetId, Measurable>>>({});

  const registerTarget = useCallback((id: TourTargetId, node: Measurable | null) => {
    if (node) nodes.current[id] = node;
    else delete nodes.current[id];
  }, []);

  const measureTarget = useCallback((id: TourTargetId): Promise<TourTargetRect | null> => {
    return new Promise((resolve) => {
      const node = nodes.current[id];
      if (!node) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    });
  }, []);

  return (
    <TourTargetsContext.Provider value={{ registerTarget, measureTarget }}>
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
