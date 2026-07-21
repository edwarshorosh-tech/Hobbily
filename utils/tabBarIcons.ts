import { Ionicons } from "@expo/vector-icons";

/**
 * Route name -> Ionicons glyph, outline for inactive / filled for active.
 * Pulled out of components/AppTabBar.tsx so the mapping (including its
 * fallback for an unrecognized route name) is independently testable.
 */
const OUTLINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  "time-manager": "calendar-outline",
  community: "chatbubbles-outline",
  opportunities: "compass-outline",
  profile: "person-outline",
};

const FILLED_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home",
  "time-manager": "calendar",
  community: "chatbubbles",
  opportunities: "compass",
  profile: "person",
};

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = "ellipse-outline";

export function resolveTabIcon(routeName: string, isFocused: boolean): keyof typeof Ionicons.glyphMap {
  const map = isFocused ? FILLED_ICONS : OUTLINE_ICONS;
  return map[routeName] ?? FALLBACK_ICON;
}
