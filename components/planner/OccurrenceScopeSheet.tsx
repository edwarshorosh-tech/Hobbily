/**
 * OccurrenceScopeSheet — "This activity / This and following / All in this
 * series" (edit) or "...Delete entire series" (delete) chooser, shown before
 * acting on one occurrence of a recurring Planner series. Reuses the shared
 * BottomSheet shell rather than a bespoke modal, same as every other sheet
 * in the app.
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import BottomSheet from "../BottomSheet";
import { OccurrenceDeleteScope, OccurrenceEditScope } from "../../services/recurrenceService";

type Props<Scope extends string> = {
  visible: boolean;
  onClose: () => void;
  onChoose: (scope: Scope) => void;
  colors: ColorTokens;
  mode: "edit" | "delete";
};

const EDIT_OPTIONS: { value: OccurrenceEditScope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "this", label: "This activity", icon: "radio-button-on-outline" },
  { value: "following", label: "This and following activities", icon: "play-forward-outline" },
  { value: "all", label: "All activities in this series", icon: "repeat" },
];

const DELETE_OPTIONS: { value: OccurrenceDeleteScope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "this", label: "Delete this activity", icon: "radio-button-on-outline" },
  { value: "following", label: "Delete this and future activities", icon: "play-forward-outline" },
  { value: "series", label: "Delete entire series", icon: "repeat" },
];

export default function OccurrenceScopeSheet<Scope extends string>({ visible, onClose, onChoose, colors, mode }: Props<Scope>) {
  const options = mode === "edit" ? EDIT_OPTIONS : DELETE_OPTIONS;
  const destructive = mode === "delete";

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="40%">
      <Text style={[styles.title, { color: colors.text }]}>
        {mode === "edit" ? "Edit repeating activity" : "Delete repeating activity"}
      </Text>
      <View style={{ gap: 4, marginTop: 4 }}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChoose(opt.value as unknown as Scope)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
          >
            <Ionicons name={opt.icon} size={19} color={destructive ? colors.danger : colors.text} />
            <Text style={[styles.rowText, { color: destructive ? colors.danger : colors.text }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 44 },
  rowText: { fontSize: 15, fontWeight: "600" },
});
