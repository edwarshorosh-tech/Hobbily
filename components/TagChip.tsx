/**
 * TagChip — a small pill-shaped label for hobby or post tags.
 *
 * Two-press delete pattern (when used in editable lists):
 *   - First press  → parent marks this chip as "pending delete" (turns red, shows ×)
 *   - Second press → parent removes the tag from the list
 *   - Pressing a DIFFERENT chip → parent resets the pending state on this one
 *
 * When used in read-only contexts (e.g. PostCard feed) omit `onPress` and
 * `isPendingDelete` — the chip renders as a plain non-interactive label.
 */
import { Text, Pressable, StyleSheet, View } from "react-native";

type Props = {
  label: string;
  textColor?: string;
  /** Background color for the chip in its default (non-pending) state */
  backgroundColor?: string;
  /** True when this chip is in the "about to be deleted" state (first press done) */
  isPendingDelete?: boolean;
  /** Called on every press — the parent decides the behaviour based on current state */
  onPress?: () => void;
};

export default function TagChip({
  label,
  textColor,
  backgroundColor,
  isPendingDelete = false,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        isPendingDelete
          ? styles.chipPending
          : { backgroundColor: backgroundColor ?? "#ddd", borderColor: backgroundColor ?? "#999" },
      ]}
    >
      <View style={styles.inner}>
        {isPendingDelete && <Text style={styles.deleteIcon}>× </Text>}
        <Text
          style={{
            color: isPendingDelete ? "#fff" : textColor,
            fontWeight: "600",
            fontSize: 13,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: "#999",
  },
  chipDefault: {
    backgroundColor: "#ddd",
  },
  chipPending: {
    backgroundColor: "#DC2626", // danger red — one more tap will delete
    borderColor: "#B91C1C",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
  },
  deleteIcon: {
    color: "#fff",
    fontWeight: "700",
  },
});
