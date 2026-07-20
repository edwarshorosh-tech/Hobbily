/**
 * useSwipeToCloseSheet — shared open/close animation + swipe-to-dismiss
 * gesture for every bottom sheet in the app. Before this hook, each sheet
 * either had no swipe gesture at all (BottomSheet.tsx's handle bar was
 * purely decorative — NotificationCenter/StreakInfoModal/HobbiesShowAllModal
 * all inherited that) or a one-off PanResponder copy (the Planner Add/Edit
 * Activity sheet, FriendSearchModal). Centralizing it here means "does
 * swipe-to-close work" only has one implementation to get right, and every
 * sheet gets it, Cancel/close-button behavior, and Escape-on-web for free.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform } from "react-native";

const OPEN_DURATION = 220;
const CLOSE_DURATION = 180;
const CLOSE_DRAG_THRESHOLD = 80;
const CLOSE_VELOCITY_THRESHOLD = 1.2;

export function useSwipeToCloseSheet(visible: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(28)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const duration = reduceMotion ? 0 : visible ? OPEN_DURATION : CLOSE_DURATION;
    if (visible) {
      setMounted(true);
      dragY.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetTranslate, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetTranslate, { toValue: 28, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, reduceMotion, backdropOpacity, sheetTranslate, dragY]);

  const panResponder = useRef(
    PanResponder.create({
      // Only the dedicated drag-handle zone attaches panHandlers (see
      // BottomSheet.tsx) — activating on any clear downward move there is
      // safe because that zone never contains scrollable content, so this
      // can never fight a ScrollView/FlatList for the gesture and can never
      // become "trapped" behind one.
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) dragY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > CLOSE_DRAG_THRESHOLD || gestureState.vy > CLOSE_VELOCITY_THRESHOLD) {
          Animated.timing(dragY, { toValue: 600, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
            dragY.setValue(0);
            onCloseRef.current();
          });
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    })
  ).current;

  // Web: Escape closes the currently open sheet — RN's Modal has no native
  // dialog element on web to wire this up automatically.
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  return {
    mounted,
    backdropOpacity,
    sheetTranslate,
    dragY,
    dragHandlers: panResponder.panHandlers,
    reduceMotion,
  };
}
