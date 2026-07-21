/**
 * Centralized disclaimer registry — see components/DisclaimerOverlay.tsx for
 * the display/queue logic and context/ProfileContext.tsx's
 * dismissedDisclaimers for persistence. Never scatter disclaimer text
 * directly across screens; add a new entry here instead.
 *
 * `route` matches expo-router's usePathname() output (root-relative, no
 * (tabs) group segment) — e.g. the Community tab is "/community", not
 * "/(tabs)/community".
 */
export type DisclaimerDef = {
  id: string;
  /** Bump only when the disclaimer's text changes materially — a bumped version reappears even for users who dismissed the old one, since the dismissal key is `${id}_v${version}`. */
  version: number;
  route: string;
  title: string;
  description: string;
  /** Higher shows first when multiple disclaimers apply to the same route (never happens today, but the queue logic supports it). */
  priority: number;
  icon: string; // Ionicons name
  isActive: boolean;
  actionLabel?: string;
  actionRoute?: string;
};

export const DISCLAIMERS: DisclaimerDef[] = [
  {
    id: "community_guidelines",
    version: 1,
    route: "/community",
    title: "Community guidelines",
    description: "Messages here are visible to everyone who joins the channel. Be kind, keep it on-topic, and never share personal contact info.",
    priority: 10,
    icon: "people-outline",
    isActive: true,
  },
  {
    id: "planner_reminders",
    version: 1,
    route: "/time-manager",
    title: "About reminders",
    description: "Scheduled reminders only pop up while Hobbily is open — keep the app running in the background around your scheduled time so you don't miss it.",
    priority: 10,
    icon: "notifications-outline",
    isActive: true,
  },
  {
    id: "quiz_not_clinical",
    version: 1,
    route: "/quiz",
    title: "Just for fun",
    description: "This quiz suggests a hobby direction based on your answers — it's not a clinical personality assessment. You can retake it anytime from Profile.",
    priority: 10,
    icon: "sparkles-outline",
    isActive: true,
  },
];

export function disclaimerKey(d: Pick<DisclaimerDef, "id" | "version">): string {
  return `${d.id}_v${d.version}`;
}

/** Active disclaimers for one route, highest priority first. */
export function disclaimersForRoute(route: string): DisclaimerDef[] {
  return DISCLAIMERS.filter((d) => d.isActive && d.route === route).sort((a, b) => b.priority - a.priority);
}
