/**
 * useSwipeToCloseSheet — shared open/close animation + swipe-to-dismiss
 * gesture for every bottom sheet in the app.
 *
 * Both the gesture recognizer (Gesture.Pan()) and the animated values it
 * drives (backdropOpacity/sheetTranslate/dragY) live entirely on the UI
 * thread via Reanimated shared values — a previous version routed the drag
 * through .runOnJS(true) into a classic Animated.Value, which meant every
 * touch-move event had to cross to the JS thread and back just to nudge the
 * sheet a few pixels. That round trip is exactly what produced the
 * lag/jitter reported after swipe-to-dismiss started working: under load
 * (a busy JS thread, a heavier sheet body) the visual update could fall a
 * frame or more behind the finger. Reading/writing shared values from
 * .onUpdate/.onEnd worklets never touches JS at all, so the drag stays
 * pixel-synced with the touch regardless of what the JS thread is doing.
 * requestClose/requestSnapBack are themselves worklets ('worklet' directive)
 * so they can be called directly from those gesture callbacks; the one
 * unavoidable JS hop — calling the caller's onClose() — happens once, at
 * the very end of the close animation, via runOnJS, never per frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { Easing, runOnJS, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

const OPEN_DURATION = 220;
const CLOSE_DURATION = 180;
const CLOSE_DRAG_THRESHOLD = 80;
/** px/s — Gesture Handler reports velocity in pixels per second. */
const CLOSE_VELOCITY_THRESHOLD = 1200;

export function useSwipeToCloseSheet(visible: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslate = useSharedValue(28);
  const dragY = useSharedValue(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // requestClose (below) is a worklet — it must never capture onCloseRef
  // itself, only a stable JS function. A worklet closing over a plain
  // mutable ref object causes Reanimated to convert that ref into a
  // "shareable" the instant the worklet is created; the `onCloseRef.current
  // = onClose` line above then mutates that same object from the JS thread
  // on every render, which is exactly what produces
  // "[Worklets] Tried to modify key `current` of an object which has been
  // already passed to a worklet" (repeated once per re-render). invokeClose
  // has a stable identity (empty deps) and only ever runs via runOnJS — i.e.
  // entirely on the JS thread — so reading onCloseRef.current inside it is
  // a normal JS property read/write, never crossing the worklet boundary.
  const invokeClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const duration = reduceMotion ? 0 : visible ? OPEN_DURATION : CLOSE_DURATION;
    if (visible) {
      setMounted(true);
      dragY.value = 0;
      backdropOpacity.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
      sheetTranslate.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
    } else {
      backdropOpacity.value = withTiming(0, { duration, easing: Easing.in(Easing.cubic) });
      sheetTranslate.value = withTiming(28, { duration, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  function requestClose() {
    "worklet";
    dragY.value = withTiming(600, { duration: 150, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) {
        dragY.value = 0;
        runOnJS(invokeClose)();
      }
    });
  }

  function requestSnapBack() {
    "worklet";
    dragY.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.5 });
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
    .onUpdate((e) => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DRAG_THRESHOLD || e.velocityY > CLOSE_VELOCITY_THRESHOLD) {
        requestClose();
      } else {
        requestSnapBack();
      }
    })
    .onFinalize((_e, success) => {
      // Safety net if the gesture is cancelled by the system without a
      // normal onEnd (e.g. an interrupting system alert) — never leaves the
      // sheet stuck mid-drag. Harmless to call again if onEnd already handled it.
      if (!success) requestSnapBack();
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
