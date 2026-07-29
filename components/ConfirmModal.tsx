/**
 * ConfirmModal component
 * A themed modal dialog that replaces the native Alert for confirmations.
 *
 * Shows a semi-transparent backdrop with a card containing a title, message,
 * a cancel button, and a confirm button (red when dangerous=true).
 *
 * Usage:
 *   <ConfirmModal
 *     visible={visible}
 *     title="Delete comment?"
 *     message="This cannot be undone."
 *     confirmLabel="Delete"
 *     dangerous
 *     onConfirm={handleConfirm}
 *     onCancel={() => setVisible(false)}
 *   />
 */
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  /** Label for the confirm button — defaults to "Confirm" */
  confirmLabel?: string;
  /** Label for the cancel button — defaults to "Cancel" */
  cancelLabel?: string;
  /** When true the confirm button is red (for destructive actions) */
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Renders the backdrop+card directly (absolutely positioned), without its
   * own native `<Modal>` — for use via BottomSheet's `overlay` prop, so a
   * confirmation shown while a sheet is still open never stacks two native
   * modal windows (unreliable on Android — see BottomSheet.tsx). Defaults
   * to false (the standalone `<Modal>` behavior, for confirmations not
   * nested inside another sheet/modal).
   */
  asOverlay?: boolean;
  /**
   * True while the confirmed mutation is in flight — disables both buttons
   * (no double-tap, no Cancel mid-mutation), swaps the confirm label for a
   * spinner, and ignores backdrop/Android-back dismissal. Always resolves on
   * its own (the caller's try/finally clears it), so this never strands the
   * dialog open — it's a brief guard, not a hang risk.
   */
  loading?: boolean;
  /**
   * Hides the Cancel button, leaving a single full-width action — for a
   * plain informational notice ("Got it") rather than a real confirm/cancel
   * choice. `onCancel` is still called by the backdrop tap and Android
   * back/Escape (there's no separate "dismiss" callback to wire), so a
   * caller in this mode should point both onConfirm and onCancel at the
   * same close handler.
   */
  hideCancel?: boolean;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dangerous = false,
  onConfirm,
  onCancel,
  asOverlay = false,
  loading = false,
  hideCancel = false,
}: Props) {
  const { colors } = useTheme();

  function handleCancel() {
    if (loading) return;
    onCancel();
  }

  const content = (
    // Semi-transparent backdrop — tapping it cancels the action
    <Pressable style={styles.backdrop} onPress={handleCancel}>
      {/* The card itself — stopPropagation so tapping inside doesn't dismiss */}
      <Pressable
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={(e) => e.stopPropagation?.()}
        accessibilityRole="alert"
      >
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.secondaryText }]}>{message}</Text>

        <View style={styles.buttons}>
          {/* Cancel — neutral colour */}
          {!hideCancel && (
            <Pressable
              style={[styles.btn, { backgroundColor: colors.border }, loading && { opacity: 0.5 }]}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>{cancelLabel}</Text>
            </Pressable>
          )}

          {/* Confirm — red for destructive actions, primary otherwise */}
          <Pressable
            style={[styles.btn, { backgroundColor: dangerous ? colors.danger : colors.primary }, loading && { opacity: 0.7 }]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.btnText, { color: "#fff" }]}>{confirmLabel}</Text>}
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );

  if (asOverlay) {
    if (!visible) return null;
    return <View style={StyleSheet.absoluteFill}>{content}</View>;
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    gap: 10,
    // Subtle shadow on iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { fontSize: 18, fontWeight: "700" },
  message: { fontSize: 15, lineHeight: 22 },
  buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { fontWeight: "600", fontSize: 15 },
});
