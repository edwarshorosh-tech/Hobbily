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
import { useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
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
  const { mounted, backdropOpacity, sheetTranslate, dragY, dragGesture } = useSwipeToCloseSheet(visible, onClose);

  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTranslate.value + dragY.value }] }));

  // Freezes the last real content in place through the close animation.
  // Callers commonly clear their own "which item is this sheet showing"
  // state (setSelectedX(null)) in the very same action that starts the
  // close (visible={false}) — without this, that state change reaches
  // `children` on the next render and the sheet's *content* blanks to an
  // empty/loading/fallback state while it's still visibly sliding down and
  // fading out, which reads as "the page refreshed" even though nothing
  // behind the sheet actually did. While visible, this always reflects the
  // latest children (loading → loaded transitions etc. still update live);
  // the instant visible flips false, it stops updating and just holds
  // whatever was last shown until BottomSheet actually unmounts.
  const frozenChildrenRef = useRef<React.ReactNode>(children);
  if (visible) frozenChildrenRef.current = children;
  const renderedChildren = visible ? children : frozenChildrenRef.current;

  if (!mounted) return null;

  const sheet = (
    <Animated.View
      style={[
        styles.sheet,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 12,
          maxHeight,
          minHeight,
        },
        sheetAnimStyle,
      ]}
    >
      {/* Drag handle — the only zone with the swipe gesture attached, so
          scrollable sheet content (FlatList/ScrollView) below is never
          fought for the gesture and can never end up permanently blocking
          dismissal. The touchable zone is a full-width ~48px strip (a real
          minimum touch target), not just the few pixels the visible 36x4
          bar occupies — that mismatch (visible handle far bigger than its
          actual hit area) was why dragging it so often just didn't
          register. */}
      <GestureDetector gesture={dragGesture}>
        <View hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }} style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>
      </GestureDetector>
      {renderedChildren}
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* react-native-gesture-handler gestures don't propagate into a native
          Modal's separate window unless that subtree has its own
          GestureHandlerRootView — the app's root one (app/_layout.tsx) does
          not extend into here. Without this, the handle's drag gesture
          would silently never activate at all. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.backdrop, backdropAnimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          {avoidKeyboard ? (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kbWrapper} pointerEvents="box-none">
              {sheet}
            </KeyboardAvoidingView>
          ) : (
            sheet
          )}
        </Animated.View>
      </GestureHandlerRootView>
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
  handleRow: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingVertical: 14 },
  handle: { width: 36, height: 4, borderRadius: 2 },
});
