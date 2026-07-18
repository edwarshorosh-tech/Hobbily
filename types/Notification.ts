import { Timestamp } from "firebase/firestore";

/**
 * Full requested union for forward-compatibility, but only
 * "friend_request_received" | "friend_request_accepted" | "achievement_unlocked"
 * are ever actually created by this app today — the others have no real event
 * source (no backend triggers, no community invitations, no shared schedules)
 * and are never written. See services/notificationsService.ts.
 */
export type NotificationType =
  | "friend_request_received"
  | "friend_request_accepted"
  | "achievement_unlocked"
  | "system_message"
  | "community_invitation"
  | "activity_reminder"
  | "schedule_update";

/**
 * A restricted enum of known, safe navigation targets — never a raw path or
 * URL string. The Notification Center only ever navigates via a switch over
 * these exact values; anything else (including malformed/unexpected data) is
 * simply not navigated to.
 */
export type NotificationRoute =
  | { screen: "profile_friends_requests" }
  | { screen: "profile_friends" }
  | { screen: "profile_badges" }
  | null;

/** users/{recipientId}/notifications/{id} */
export type AppNotification = {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId: string | null;
  entityId: string | null;
  route: NotificationRoute;
  isRead: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
