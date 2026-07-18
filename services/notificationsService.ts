/**
 * notificationsService
 * Firestore access for users/{uid}/notifications/{id}. Creation helpers are
 * used by services/friendsService.ts and context/ProgressContext.tsx so the
 * notification write can happen inside the same transaction/batch as the
 * event that caused it (friendship state change, achievement earned).
 */
import {
  collection,
  CollectionReference,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { AppNotification, NotificationRoute, NotificationType } from "../types/Notification";

export const NOTIFICATIONS_PAGE_SIZE = 30;

export type NotificationServiceErrorCode = "permission-denied" | "network-error" | "unknown";

export class NotificationServiceError extends Error {
  code: NotificationServiceErrorCode;
  constructor(code: NotificationServiceErrorCode, message: string) {
    super(message);
    this.name = "NotificationServiceError";
    this.code = code;
  }
}

function mapFirestoreError(e: unknown): NotificationServiceError {
  const code = (e as { code?: string } | null)?.code;
  if (code === "permission-denied") {
    return new NotificationServiceError("permission-denied", "You don't have permission to do that.");
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "cancelled") {
    return new NotificationServiceError("network-error", "Network error — please try again.");
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn("[notificationsService]", e);
  }
  return new NotificationServiceError("unknown", "Something went wrong. Please try again.");
}

export function notificationsCollection(uid: string): CollectionReference {
  return collection(db, "users", uid, "notifications");
}

/**
 * Builds the payload for a new notification (everything but the doc id).
 * `actorId` must equal the calling client's own uid for every type this app
 * actually creates — enforced both here (by callers always passing their own
 * uid) and, authoritatively, by firestore.rules.
 */
export function buildNotificationPayload(params: {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId: string | null;
  entityId: string | null;
  route: NotificationRoute;
}): Omit<AppNotification, "id"> {
  return {
    recipientId: params.recipientId,
    type: params.type,
    title: params.title,
    body: params.body,
    actorId: params.actorId,
    entityId: params.entityId,
    route: params.route,
    isRead: false,
    createdAt: serverTimestamp() as unknown as AppNotification["createdAt"],
    updatedAt: serverTimestamp() as unknown as AppNotification["updatedAt"],
  };
}

export function subscribeToUnreadCount(
  uid: string,
  onChange: (count: number) => void,
  onError?: (error: NotificationServiceError) => void
): Unsubscribe {
  const q = query(notificationsCollection(uid), where("isRead", "==", false));
  return onSnapshot(
    q,
    (snap) => onChange(snap.size),
    (err) => onError?.(mapFirestoreError(err))
  );
}

export function subscribeToNotifications(
  uid: string,
  onChange: (notifications: AppNotification[]) => void,
  onError?: (error: NotificationServiceError) => void,
  pageSize: number = NOTIFICATIONS_PAGE_SIZE
): Unsubscribe {
  const q = query(notificationsCollection(uid), orderBy("createdAt", "desc"), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification))),
    (err) => onError?.(mapFirestoreError(err))
  );
}

export async function markAsRead(uid: string, notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(notificationsCollection(uid), notificationId), {
      isRead: true,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    throw mapFirestoreError(e);
  }
}

export async function markAllAsRead(uid: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    notificationIds.forEach((id) => {
      batch.update(doc(notificationsCollection(uid), id), {
        isRead: true,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (e) {
    throw mapFirestoreError(e);
  }
}
