/**
 * OnboardingTourContext — the single on/off switch for components/
 * OnboardingTour.tsx's visibility, shared between app/(tabs)/_layout.tsx
 * (which renders the tour and owns the post-signup auto-trigger) and any
 * other screen that wants to launch it on demand — currently Settings'
 * "Replay App Tour" row (app/(tabs)/profile.tsx). Neither of those two
 * components is an ancestor of the other, so this has to live above both in
 * the tree rather than as local state in either one.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type OnboardingTourContextType = {
  isTourVisible: boolean;
  /**
   * Where OnboardingTour should return to when it ends. null means "the
   * first-launch tour" — it always lands on Home when finished, regardless
   * of which tab it was on. A route string means "launched manually from
   * that screen" (currently only Profile > Settings' "Replay App Tour") —
   * the tour returns there instead, whether the user finishes it or taps
   * Skip.
   */
  originRoute: string | null;
  /** Shows the tour from step 1 — safe to call from anywhere, including while a different tab is focused; OnboardingTour's own step 1 navigates to Home itself. Pass the current route when launching manually so the tour can return there when it ends; omit for the first-launch auto-trigger. */
  startTour: (originRoute?: string) => void;
  /** Hides the tour — callers are responsible for also persisting completion (see ProfileContext.completeOnboardingTour), this only controls visibility. */
  hideTour: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextType | undefined>(undefined);

export function OnboardingTourProvider({ children }: { children: React.ReactNode }) {
  const [isTourVisible, setIsTourVisible] = useState(false);
  const [originRoute, setOriginRoute] = useState<string | null>(null);

  const startTour = useCallback((origin?: string) => {
    setOriginRoute(origin ?? null);
    setIsTourVisible(true);
  }, []);
  const hideTour = useCallback(() => setIsTourVisible(false), []);

  const value = useMemo(
    () => ({ isTourVisible, originRoute, startTour, hideTour }),
    [isTourVisible, originRoute, startTour, hideTour]
  );

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}

export function useOnboardingTourController() {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) throw new Error("useOnboardingTourController must be used inside OnboardingTourProvider");
  return ctx;
}
