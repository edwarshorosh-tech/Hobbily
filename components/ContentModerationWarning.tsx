/**
 * ContentModerationWarning — dismissible inline banner shown above a
 * composer/field when checkText() blocks the current draft. Deliberately not
 * a full-screen Modal: it must never cover the message list, block scroll,
 * or intercept Android Back — dismissing it only hides the banner itself
 * (the caller keeps Send disabled and the inline field error visible until
 * the text is actually fixed; see app/(tabs)/community.tsx's own
 * moderationBlocked/bannerDismissed split).
 */
import { useEffect, useRef, useState } from "react";
import { Animated, AccessibilityInfo, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  message: string;
  onDismiss: () => void;
};

export default function ContentModerationWarning({ visible, message, onDismiss }: Props) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 120 : 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, reduceMotion, progress]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.danger + "18", borderColor: colors.danger },
        {
          opacity: progress,
          transform: reduceMotion ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss warning"
        accessibilityHint="Hides this warning without allowing the message to be sent"
      >
        <Ionicons name="close" size={16} color={colors.danger} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
