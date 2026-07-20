import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { TAB_BAR_CONTENT_HEIGHT, useTabBarHeight } from "../../hooks/useTabBarHeight";

export default function TabsLayout() {
  const { colors } = useTheme();
  const TAB_HEIGHT = useTabBarHeight();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: TAB_HEIGHT,
          paddingBottom: TAB_HEIGHT - TAB_BAR_CONTENT_HEIGHT + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
            index: "home-outline",
            "time-manager": "calendar-outline",
            community: "chatbubbles-outline",
            opportunities: "compass-outline",
            profile: "person-outline",
          };
          return <Ionicons name={iconMap[route.name] ?? "ellipse-outline"} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="time-manager" options={{ title: "Planner" }} />
      <Tabs.Screen name="community" options={{ title: "Community" }} />
      <Tabs.Screen name="opportunities" options={{ title: "Explore" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
