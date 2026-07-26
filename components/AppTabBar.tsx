/**
 * AppTabBar — custom bottom tab bar replacing React Navigation's default
 * bar, so the active tab gets a real, polished treatment (soft capsule
 * background, filled icon, semibold label, small top accent line) instead
 * of just a subtle icon-color change.
 *
 * Reads `state`/`descriptors`/`navigation` straight from React Navigation's
 * BottomTabBarProps — the same real navigation state Expo Router itself
 * drives — so it is automatically correct after a tab press, programmatic
 * navigation (e.g. the leaderboard's "Add Friends" deep link), an edge
 * swipe (components/SwipeableTab.tsx calls router.navigate, which updates
 * this same state), Back, or a deep link. There is no separate "active tab"
 * variable to fall out of sync.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme, ColorTokens } from "../context/ThemeContext";
import { TAB_BAR_CONTENT_HEIGHT } from "../hooks/useTabBarHeight";
import { resolveTabIcon } from "../utils/tabBarIcons";

const ANIM_DURATION = 200;

function TabItem({
  routeName,
  label,
  isFocused,
  onPress,
  colors,
  reduceMotion,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  colors: ColorTokens;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, { duration: reduceMotion ? 0 : ANIM_DURATION });
  }, [isFocused, reduceMotion, progress]);

  // One pill is the whole active indicator — it wraps icon *and* label
  // together (not a separate icon-only capsule plus a detached top line),
  // so there is exactly one thing that fades/scales in, and it's already
  // centered in its tab slot by the normal flex layout rather than absolute
  // positioning that could drift out of alignment with what it's meant to
  // sit behind.
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["transparent", `${colors.tabBarActive}1F`]),
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));
  const iconLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : -progress.value * 2 }],
  }));
  const labelColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.tabBarInactive, colors.tabBarActive]),
  }));

  const iconName = resolveTabIcon(routeName, isFocused);

  return (
    <Pressable
      onPress={onPress}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      hitSlop={{ top: 4, bottom: 4 }}
    >
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={iconLiftStyle}>
          <Ionicons name={iconName} size={26} color={isFocused ? colors.tabBarActive : colors.tabBarInactive} />
        </Animated.View>
        <Animated.Text
          style={[styles.label, { fontWeight: isFocused ? "700" : "500" }, labelColorStyle]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export default function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 6,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom + 6,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === "string" ? options.title : route.name;
        const isFocused = state.index === index;

        function onPress() {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused) {
            Haptics.selectionAsync().catch(() => undefined);
            if (!event.defaultPrevented) navigation.navigate(route.name);
          }
        }

        return (
          <TabItem
            key={route.key}
            routeName={route.name}
            label={label}
            isFocused={isFocused}
            onPress={onPress}
            colors={colors}
            reduceMotion={reduceMotion}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // The pill is the one active indicator — icon and label live inside it,
  // so it's always exactly as wide as its own content and always centered
  // in its tab slot via normal flex alignment (never an arbitrary fixed
  // width fighting the item's real size).
  pill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 56,
  },
  label: { fontSize: 11 },
});
