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
 * The animated values are Reanimated shared values, not classic RN
 * `Animated.Value`s, and the gesture has no `.runOnJS(true)`: every callback
 * below (onUpdate/onEnd/onFinalize) runs as a UI-thread worklet, so dragging
 * the handle never has to round-trip to the JS thread to move the sheet —
 * that JS hop (the previous implementation's `.runOnJS(true)` +
 * `Animated.Value.setValue`) was the source of the visible stutter during
 * drag. Only the plain-JS side effect (closing the sheet, via onClose) is
 * explicitly hopped back with runOnJS() at its call site — same pattern
 * SwipeableTab.tsx already uses for its own gesture.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { Easing, runOnJS, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

const OPEN_DURATION = 260;
const CLOSE_DURATION = 180;
/** How far below its resting position the sheet starts from (and animates back down to before unmounting) — big enough to read as an actual slide-up, not just a fade with a barely-perceptible nudge. */
const CLOSED_TRANSLATE_Y = 48;
const CLOSE_DRAG_THRESHOLD = 80;
/** px/s — Gesture Handler reports velocity in pixels per second (unlike PanResponder's px/ms-ish vy), so this is the real-world equivalent of the old 1.2 threshold. */
const CLOSE_VELOCITY_THRESHOLD = 1200;
/** Natural, non-bouncy deceleration for the sheet sliding into place on open — reads as noticeably more fluid than a fixed-duration easing curve. Only the open path uses this; close stays a quick, deterministic withTiming so dismissal never feels like it lingers. */
const OPEN_SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

export function useSwipeToCloseSheet(visible: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslate = useSharedValue(CLOSED_TRANSLATE_Y);
  const dragY = useSharedValue(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // commitClose (below) is a worklet — it must never capture onCloseRef
  // itself, only a stable JS function. A worklet closing over a plain
  // mutable ref object causes Reanimated to convert that ref into a
  // "shareable" the instant the worklet is created; the `onCloseRef.current
  // = onClose` line above then mutates that same object from the JS thread
  // on every render, which is exactly what produces
  // "[Worklets] Tried to modify key `current` of an object which has been
  // already passed to a worklet" (repeated once per re-render). triggerClose
  // has a stable identity (created once, via useRef) and only ever runs via
  // runOnJS — i.e. entirely on the JS thread — so reading onCloseRef.current
  // inside it is a normal JS property read/write, never crossing the
  // worklet boundary.
  const triggerClose = useRef(() => onCloseRef.current()).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.value = 0;
      if (reduceMotion) {
        backdropOpacity.value = 1;
        sheetTranslate.value = 0;
      } else {
        backdropOpacity.value = withTiming(1, { duration: OPEN_DURATION, easing: Easing.out(Easing.cubic) });
        // Spring rather than withTiming — a fixed-duration ease-out always
        // arrives at exactly the same instant regardless of how it got
        // there, which is what read as mechanical/abrupt; a spring's
        // natural, slightly-varying deceleration is what actually makes
        // this feel smooth rather than just "fast".
        sheetTranslate.value = withSpring(0, OPEN_SPRING);
      }
    } else {
      const duration = reduceMotion ? 0 : CLOSE_DURATION;
      backdropOpacity.value = withTiming(0, { duration, easing: Easing.in(Easing.cubic) });
      sheetTranslate.value = withTiming(CLOSED_TRANSLATE_Y, { duration, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, reduceMotion, backdropOpacity, sheetTranslate, dragY]);

  function commitClose() {
    "worklet";
    dragY.value = withTiming(600, { duration: 150, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) {
        dragY.value = 0;
        runOnJS(triggerClose)();
      }
    });
  }

  function snapBack() {
    "worklet";
    dragY.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.4 });
  }

  // Only the dedicated drag-handle zone gets this gesture (see
  // BottomSheet.tsx) — that zone never contains scrollable content, so it
  // can never fight a ScrollView/FlatList for the gesture and can never end
  // up "trapped" behind one. activeOffsetY(8) means a small vertical move
  // is needed before the gesture takes over (so a plain tap on the handle
  // is never mistaken for a drag); translationY is clamped to >=0 in
  // onUpdate since dragging the handle *up* should do nothing.
  //
  // Deliberately no .runOnJS(true) here — every callback below is a
  // UI-thread worklet (Reanimated's babel plugin compiles them), which is
  // what makes the drag track the finger every frame without waiting on the
  // JS thread. commitClose/snapBack are worklets themselves for the same
  // reason; only the final onClose() call hops to JS via runOnJS().
  const dragGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      if (e.translationY > 0) dragY.value = e.translationY;
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
