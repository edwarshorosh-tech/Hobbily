/**
 * useSwipeToCloseSheet — shared open/close animation + swipe-to-dismiss
 * gesture for every bottom sheet in the app.
 *
 * The drag recognizer is react-native-gesture-handler's Gesture.Pan(), not
 * the legacy PanResponder this used to use. PanResponder relies on RN's
 * bridge-based responder system, which is a known weak spot specifically
 * for a gesture living inside a native `Modal` with the New Architecture
 * (Fabric) enabled (this app has newArchEnabled:true) — touches inside a
 * Modal's separate native window can arrive late or get dropped, which is
 * exactly the "sometimes just doesn't respond" symptom swipe-to-dismiss had
 * even after the handle's hit area and responder-termination logic were
 * already fixed. Gesture Handler recognizes touches on the native/UI
 * thread and doesn't have this weakness — it's already used successfully
 * elsewhere in this app (components/SwipeableTab.tsx).
 *
 * The gesture only drives the classic Animated.Value `dragY` (via
 * .runOnJS(true), so its callbacks are plain JS-thread functions — no
 * worklet/setGestureState concerns here, since this is a normal
 * auto-activating pan, not manual activation). Composition with
 * `sheetTranslate`/`backdropOpacity` and the open/close entrance animation
 * are untouched.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";

const OPEN_DURATION = 220;
const CLOSE_DURATION = 180;
const CLOSE_DRAG_THRESHOLD = 80;
/** px/s — Gesture Handler reports velocity in pixels per second (unlike PanResponder's px/ms-ish vy), so this is the real-world equivalent of the old 1.2 threshold. */
const CLOSE_VELOCITY_THRESHOLD = 1200;

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

  function commitClose() {
    Animated.timing(dragY, { toValue: 600, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      dragY.setValue(0);
      onCloseRef.current();
    });
  }

  function snapBack() {
    Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  }

  // Only the dedicated drag-handle zone gets this gesture (see
  // BottomSheet.tsx) — that zone never contains scrollable content, so it
  // can never fight a ScrollView/FlatList for the gesture and can never end
  // up "trapped" behind one. activeOffsetY(8) means a small vertical move
  // is needed before the gesture takes over (so a plain tap on the handle
  // is never mistaken for a drag); translationY is clamped to >=0 in
  // onUpdate since dragging the handle *up* should do nothing.
  const dragGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .runOnJS(true)
    .onUpdate((e) => {
      if (e.translationY > 0) dragY.setValue(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DRAG_THRESHOLD || e.velocityY > CLOSE_VELOCITY_THRESHOLD) {
        commitClose();
      } else {
        snapBack();
      }
    })
    .onFinalize((e, success) => {
      // Safety net if the gesture is cancelled by the system without a
      // normal onEnd (e.g. an interrupting system alert) — never leaves the
      // sheet stuck mid-drag. Harmless to call again if onEnd already handled it.
      if (!success) snapBack();
    });

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
    dragGesture,
    reduceMotion,
  };
}
