/**
 * NotificationCenter — full-height "Notifications" bottom sheet opened from
 * the Home bell. Reuses the backdrop-fade + slide-up Animated pattern already
 * proven in FriendSearchModal.tsx (no new animation dependency). Subscribes
 * to the current user's notifications only while open (the always-on badge
 * count listener lives separately in NotificationBell.tsx).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Timestamp } from "firebase/firestore";
import { ColorTokens } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { AppNotification, NotificationType } from "../../types/Notification";
import {
  NotificationServiceError,
  markAllAsRead,
  markAsRead,
  subscribeToNotifications,
} from "../../services/notificationsService";
import BottomSheet from "../BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
};

const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  friend_request_received: "person-add-outline",
  friend_request_accepted: "people-outline",
  achievement_unlocked: "trophy-outline",
  system_message: "megaphone-outline",
  community_invitation: "chatbubbles-outline",
  activity_reminder: "alarm-outline",
  schedule_update: "calendar-outline",
};

function friendlyMessage(e: unknown): string {
  if (e instanceof NotificationServiceError) {
    if (e.code === "permission-denied") return "You don't have permission to view this.";
    if (e.code === "network-error") return "Network error — please try again.";
  }
  return "Something went wrong. Please try again.";
}

function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  const date = ts.toDate();
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function isToday(ts: Timestamp | null | undefined): boolean {
  if (!ts) return false;
  return ts.toDate().toDateString() === new Date().toDateString();
}

/** Only known, whitelisted screen values ever navigate — anything else is a no-op. */
function navigateForNotification(n: AppNotification) {
  if (!n.route) return;
  switch (n.route.screen) {
    case "profile_friends_requests":
      router.push({ pathname: "/(tabs)/profile", params: { openRequests: "1" } });
      return;
    case "profile_friends":
      router.push("/(tabs)/profile");
      return;
    case "profile_badges":
      router.push({ pathname: "/(tabs)/profile", params: { tab: "badges" } });
      return;
    default:
      return;
  }
}

function NotificationRow({
  item,
  colors,
  onPress,
}: {
  item: AppNotification;
  colors: ColorTokens;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}${item.isRead ? "" : ". Unread"}`}
    >
      <View style={[styles.unreadDot, { backgroundColor: item.isRead ? "transparent" : colors.primary }]} />
      <View style={[styles.typeIconWrap, { backgroundColor: colors.secondary }]}>
        <Ionicons name={TYPE_ICON[item.type]} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.rowText, { color: colors.secondaryText }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.rowTime, { color: colors.secondaryText }]}>{formatTimestamp(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationCenter({ visible, onClose, colors }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!visible || !user) {
      setItems(null);
      return;
    }
    setLoadError(null);
    const unsub = subscribeToNotifications(
      user.uid,
      (list) => setItems(list),
      (e) => setLoadError(friendlyMessage(e))
    );
    return unsub;
  }, [visible, user]);

  const grouped = useMemo(() => {
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    (items ?? []).forEach((n) => (isToday(n.createdAt) ? today : earlier).push(n));
    return { today, earlier };
  }, [items]);

  const unreadIds = useMemo(() => (items ?? []).filter((n) => !n.isRead).map((n) => n.id), [items]);

  const handlePressItem = useCallback(
    (n: AppNotification) => {
      if (!user) return;
      if (!n.isRead) {
        markAsRead(user.uid, n.id).catch((e) => {
          if (__DEV__) console.warn("[NotificationCenter] markAsRead failed", e);
        });
      }
      onClose();
      navigateForNotification(n);
    },
    [user, onClose]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!user || unreadIds.length === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllAsRead(user.uid, unreadIds);
    } catch (e) {
      if (__DEV__) console.warn("[NotificationCenter] markAllAsRead failed", e);
    } finally {
      setMarkingAll(false);
    }
  }, [user, unreadIds, markingAll]);

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} minHeight="50%">
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        <View style={styles.titleActions}>
          {unreadIds.length > 0 && (
            <TouchableOpacity onPress={handleMarkAllRead} disabled={markingAll} accessibilityRole="button">
              {markingAll ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>
      </View>

      {items === null && !loadError ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.secondaryText} />
        </View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.secondaryText} />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{loadError}</Text>
        </View>
      ) : items && items.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="notifications-outline" size={26} color={colors.secondaryText} />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>You&apos;re all caught up.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {grouped.today.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>Today</Text>
              {grouped.today.map((n) => (
                <NotificationRow key={n.id} item={n} colors={colors} onPress={() => handlePressItem(n)} />
              ))}
            </>
          )}
          {grouped.earlier.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 12 }]}>Earlier</Text>
              {grouped.earlier.map((n) => (
                <NotificationRow key={n.id} item={n} colors={colors} onPress={() => handlePressItem(n)} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 10 },
  title: { fontSize: 19, fontWeight: "800" },
  titleActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  markAllText: { fontSize: 13, fontWeight: "700" },
  closeBtn: { padding: 2 },
  centerState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 },
  emptyText: { fontSize: 13, textAlign: "center" },
  list: { flexGrow: 0 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  typeIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowText: { fontSize: 13, lineHeight: 18 },
  rowTime: { fontSize: 11, marginTop: 2 },
});
