/**
 * NotificationBell — Home header bell with a live unread-count badge.
 * One real-time listener per mount (cleaned up on unmount/uid change);
 * opens NotificationCenter on press.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { subscribeToUnreadCount } from "../../services/notificationsService";
import NotificationCenter from "./NotificationCenter";

type Props = { colors: ColorTokens };

export default function NotificationBell({ colors }: Props) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [centerVisible, setCenterVisible] = useState(false);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    const unsub = subscribeToUnreadCount(
      user.uid,
      setUnreadCount,
      (e) => {
        if (__DEV__) console.warn("[NotificationBell] unread count listener failed", e);
      }
    );
    return unsub;
  }, [user]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setCenterVisible(true)}
        style={[styles.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: "#EF4444", borderColor: colors.background }]}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <NotificationCenter visible={centerVisible} onClose={() => setCenterVisible(false)} colors={colors} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
