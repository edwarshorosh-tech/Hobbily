/**
 * BottomSheet — the shared bottom-sheet shell (backdrop fade + slide-up
 * panel + drag handle + safe-area bottom padding + Android back handling)
 * used by every bottom sheet in the app. Extracted from NotificationCenter
 * so the Streak sheet (and any future one) gets identical chrome/animation
 * instead of a second modal architecture.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorTokens } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
  children: React.ReactNode;
  /** Sheet's max height, e.g. "86%" (default) or a fixed number of pixels. */
  maxHeight?: ViewStyle["maxHeight"];
  /** Optional min height, e.g. "50%" — used by content-heavy sheets like Notifications. */
  minHeight?: ViewStyle["minHeight"];
};

export default function BottomSheet({ visible, onClose, colors, children, maxHeight = "86%", minHeight }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const duration = reduceMotion ? 0 : 220;
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetTranslate, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: reduceMotion ? 0 : 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetTranslate, { toValue: 28, duration: reduceMotion ? 0 : 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, reduceMotion, backdropOpacity, sheetTranslate]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
              transform: [{ translateY: sheetTranslate }],
              maxHeight,
              minHeight,
            },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handleRow: { alignItems: "center", paddingVertical: 6 },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
