/**
 * ExpandableIdentityCard — the Profile identity card.
 *
 * Collapsed: avatar, full username, "View profile details" hint, chevron —
 * never a partially-fit city string (that was the source of the "Hai..."
 * clipping bug this replaces).
 *
 * Expanded: adds full city, age, and bio below a divider. Reuses Reanimated
 * (already a project dependency, already used by SwipeableTab.tsx) for a
 * height+opacity animation: the expanded content is always rendered (so its
 * natural height can be measured via onLayout), and a shared value animates
 * between 0 and that measured height — avoids animating to an unknown "auto"
 * height without needing imperative measure()/worklets.
 */
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import FriendAvatar from "../friends/FriendAvatar";

type Props = {
  username: string;
  city: string;
  age: string;
  bio: string;
  avatarUrl?: string | null;
  colors: ColorTokens;
  /** Optional compact "Edit profile" action shown when expanded — switches the parent to the Settings tab. */
  onEditProfile?: () => void;
};

export default function ExpandableIdentityCard({ username, city, age, bio, avatarUrl, colors, onEditProfile }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const heightValue = useSharedValue(0);
  const opacityValue = useSharedValue(0);
  const chevronRotation = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const duration = reduceMotion ? 0 : 200;
    chevronRotation.value = withTiming(expanded ? 1 : 0, { duration, easing: Easing.out(Easing.cubic) });
    if (contentHeight === 0) return;
    heightValue.value = withTiming(expanded ? contentHeight : 0, { duration, easing: Easing.out(Easing.cubic) });
    opacityValue.value = withTiming(expanded ? 1 : 0, { duration, easing: Easing.out(Easing.cubic) });
  }, [expanded, contentHeight, reduceMotion, heightValue, opacityValue, chevronRotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightValue.value,
    opacity: opacityValue.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setContentHeight((prev) => (Math.round(prev) !== Math.round(h) ? h : prev));
  }, []);

  const displayName = username || "Your Name";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? "Collapse profile details" : "View profile details"}
      >
        <FriendAvatar username={displayName} avatarUrl={avatarUrl} size={60} colors={colors} highlighted />
        <View style={styles.headerInfo}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.hint, { color: colors.secondaryText }]}>
            {expanded ? "Hide profile details" : "View profile details"}
          </Text>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={20} color={colors.secondaryText} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={[styles.expandedClip, animatedStyle]}>
        <View onLayout={handleLayout} style={styles.expandedContent}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {city ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color={colors.secondaryText} />
              <Text style={[styles.metaText, { color: colors.text }]}>{city}</Text>
            </View>
          ) : null}
          {age ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={15} color={colors.secondaryText} />
              <Text style={[styles.metaText, { color: colors.text }]}>{age} years old</Text>
            </View>
          ) : null}
          <Text style={[styles.bio, { color: bio ? colors.text : colors.secondaryText }]}>
            {bio || "No bio added yet."}
          </Text>
          {onEditProfile ? (
            <TouchableOpacity
              onPress={onEditProfile}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit profile</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 18, borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  headerInfo: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 19, fontWeight: "800" },
  hint: { fontSize: 12 },
  expandedClip: { overflow: "hidden" },
  expandedContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  divider: { height: 1, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 14, flex: 1, flexShrink: 1, flexWrap: "wrap" },
  bio: { fontSize: 14, lineHeight: 20 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 2 },
  editBtnText: { fontSize: 13, fontWeight: "700" },
});
