/**
 * useTabBarHeight — the single source of truth for how tall the bottom tab
 * bar renders, shared between app/(tabs)/_layout.tsx (which sets it) and any
 * screen that needs to reason about the space it occupies. Previously each
 * tab screen wrapped its content in a default-edges SafeAreaView (reserving
 * `insets.bottom` again) on top of the Tabs navigator already reserving that
 * same inset inside the tab bar's own height — a redundant double
 * reservation that could show a gap (revealing the native window background)
 * between the real end of a screen's content and the tab bar. Screens should
 * use `edges={["top", "left", "right"]}` on their outer SafeAreaView (see
 * the tab screens under app/(tabs)/) and rely on this hook only if they need
 * the tab bar's pixel height directly (e.g. for a floating action button).
 */
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Icon + label row height, excluding the bottom safe-area inset. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + insets.bottom;
}
