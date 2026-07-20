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
import { ColorTokens } from "../context/ThemeContext";

type Props = {
  label: string;
  /** Required for variant="solid"; ignored for variant="tinted" (uses colors.chipTintText instead). */
  textColor?: string;
  /** Background color for the chip in its default (non-pending) state */
  backgroundColor?: string;
  /** True when this chip is in the "about to be deleted" state (first press done) */
  isPendingDelete?: boolean;
  /** Called on every press — the parent decides the behaviour based on current state */
  onPress?: () => void;
  /**
   * "solid" (default) — the existing bright-color pill used for interactive/tag
   * contexts (Settings hobby editor, PostCard tags).
   * "tinted" — a subtle tinted-blue read-only look for static interest chips
   * (Profile Overview hobbies) that shouldn't look like a form control.
   *
   * Required when variant is "tinted", since its colors come from the active
   * theme's chipTintBg/chipTintText tokens (a pale tint needs dark text in
   * light mode and can afford light text in dark mode — a fixed hex pair
   * can't serve both).
   */
  variant?: "solid" | "tinted";
  colors?: ColorTokens;
};

export default function TagChip({
  label,
  textColor,
  backgroundColor,
  isPendingDelete = false,
  onPress,
  variant = "solid",
  colors,
}: Props) {
  const tintedStyle = {
    backgroundColor: colors?.chipTintBg ?? "rgba(59,130,246,0.16)",
    borderColor: colors?.chipTintBorder ?? "rgba(96,165,250,0.4)",
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        isPendingDelete
          ? styles.chipPending
          : variant === "tinted"
          ? tintedStyle
          : { backgroundColor: backgroundColor ?? "#ddd", borderColor: backgroundColor ?? "#999" },
      ]}
    >
      <View style={styles.inner}>
        {isPendingDelete && <Text style={styles.deleteIcon}>× </Text>}
        <Text
          style={{
            color: isPendingDelete ? "#fff" : variant === "tinted" ? (colors?.chipTintText ?? "#F1F5F9") : (textColor ?? colors?.text ?? "#000"),
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
