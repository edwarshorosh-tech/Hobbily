/**
 * BottomSheet — the shared bottom-sheet shell (backdrop fade + slide-up
 * panel + drag handle + safe-area bottom padding + Android back handling +
 * swipe-to-close + Escape-on-web) used by every bottom sheet in the app.
 * Extracted from NotificationCenter so the Streak sheet (and any future one)
 * gets identical chrome/animation/gestures instead of a second modal
 * architecture. Swipe-to-close and animation live in useSwipeToCloseSheet —
 * shared with FriendSearchModal and the Planner Add/Edit Activity sheet,
 * which have their own layouts but the same open/close/gesture behavior.
 */
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, ViewStyle, Animated as RNAnimated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorTokens } from "../context/ThemeContext";
import { useSwipeToCloseSheet } from "../hooks/useSwipeToCloseSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
  children: React.ReactNode;
  /** Sheet's max height, e.g. "86%" (default) or a fixed number of pixels. */
  maxHeight?: ViewStyle["maxHeight"];
  /** Optional min height, e.g. "50%" — used by content-heavy sheets like Notifications. */
  minHeight?: ViewStyle["minHeight"];
  /** Wraps children in a KeyboardAvoidingView — for sheets containing text inputs (e.g. the Planner Add/Edit Activity sheet). Defaults to false. */
  avoidKeyboard?: boolean;
};

export default function BottomSheet({ visible, onClose, colors, children, maxHeight = "86%", minHeight, avoidKeyboard = false }: Props) {
  const insets = useSafeAreaInsets();
  const { mounted, backdropOpacity, sheetTranslate, dragY, dragHandlers } = useSwipeToCloseSheet(visible, onClose);

  if (!mounted) return null;

  const sheet = (
    <RNAnimated.View
      style={[
        styles.sheet,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
          transform: [{ translateY: RNAnimated.add(sheetTranslate, dragY) }],
          maxHeight,
          minHeight,
        },
      ]}
    >
      {/* Drag handle — the only zone with panHandlers, so scrollable sheet
          content (FlatList/ScrollView) below is never fought for the
          gesture and can never end up permanently blocking dismissal. */}
      <View {...dragHandlers} hitSlop={{ top: 10, bottom: 10, left: 40, right: 40 }} style={styles.handleRow}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>
      {children}
    </RNAnimated.View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <RNAnimated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        {avoidKeyboard ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kbWrapper} pointerEvents="box-none">
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </RNAnimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  kbWrapper: { justifyContent: "flex-end" },
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
