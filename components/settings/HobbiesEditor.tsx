/**
 * HobbiesEditor — Settings' hobby picker. Replaces the old two-tap
 * select-then-confirm delete pattern: selected hobbies show a single visible
 * remove (✕) icon, and suggested hobbies are a separate list where a single
 * press adds them. Purely local state — the parent (Settings) owns
 * saving/Firestore via the existing profile save flow; this component only
 * ever calls `onChange` with the next hobbies array.
 */
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { HOBBY_OPTIONS } from "../../constants/hobbies";

export const MAX_HOBBIES = 20;

type Props = {
  hobbies: string[];
  onChange: (next: string[]) => void;
  colors: ColorTokens;
  disabled?: boolean;
  /** Section label — defaults to "My Hobbies" (Settings); New Post passes "Related hobbies". */
  title?: string;
};

export default function HobbiesEditor({ hobbies, onChange, colors, disabled = false, title = "My Hobbies" }: Props) {
  const [query, setQuery] = useState("");
  const [duplicateNotice, setDuplicateNotice] = useState("");

  const atLimit = hobbies.length >= MAX_HOBBIES;

  const suggestions = useMemo(() => {
    const selected = new Set(hobbies.map((h) => h.toLowerCase()));
    const q = query.trim().toLowerCase();
    return HOBBY_OPTIONS.filter((h) => !selected.has(h.label.toLowerCase()))
      .filter((h) => !q || h.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [hobbies, query]);

  function addHobby(label: string) {
    const trimmed = label.trim();
    if (!trimmed || disabled || atLimit) return;
    if (hobbies.some((h) => h.toLowerCase() === trimmed.toLowerCase())) {
      setDuplicateNotice(`"${trimmed}" is already in your hobbies.`);
      setQuery("");
      return;
    }
    setDuplicateNotice("");
    onChange([...hobbies, trimmed]);
    setQuery("");
  }

  function removeHobby(label: string) {
    if (disabled) return;
    onChange(hobbies.filter((h) => h !== label));
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.count, { color: atLimit ? colors.danger : colors.secondaryText }]}>
          {hobbies.length}/{MAX_HOBBIES}
        </Text>
      </View>

      <View style={[styles.inputRow, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.secondaryText} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={atLimit ? `Limit reached (${MAX_HOBBIES})` : "Search or add a hobby"}
          placeholderTextColor={colors.secondaryText}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setDuplicateNotice("");
          }}
          onSubmitEditing={() => addHobby(query)}
          returnKeyType="done"
          editable={!disabled && !atLimit}
        />
        {query.trim().length > 0 && (
          <TouchableOpacity
            onPress={() => addHobby(query)}
            disabled={disabled || atLimit}
            accessibilityRole="button"
            accessibilityLabel={`Add "${query.trim()}" as a hobby`}
          >
            <Ionicons name="add-circle" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {duplicateNotice ? (
        <Text style={[styles.duplicateNotice, { color: colors.danger }]}>{duplicateNotice}</Text>
      ) : null}

      {hobbies.length > 0 ? (
        <View style={styles.chipWrap}>
          {hobbies.map((tag) => (
            <View key={tag} style={[styles.selectedChip, { backgroundColor: colors.primary }]}>
              <Text style={styles.selectedChipText} numberOfLines={1}>
                {tag}
              </Text>
              <TouchableOpacity
                onPress={() => removeHobby(tag)}
                disabled={disabled}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${tag}`}
              >
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No hobbies added yet.</Text>
      )}

      {suggestions.length > 0 && !atLimit && (
        <>
          <Text style={[styles.suggestLabel, { color: colors.secondaryText }]}>Suggested</Text>
          <View style={styles.chipWrap}>
            {suggestions.map((h) => (
              <TouchableOpacity
                key={h.label}
                onPress={() => addHobby(h.label)}
                disabled={disabled}
                style={[styles.suggestChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                accessibilityRole="button"
                accessibilityLabel={`Add ${h.label}`}
              >
                <Ionicons name={h.icon} size={13} color={colors.secondaryText} />
                <Text style={[styles.suggestChipText, { color: colors.text }]}>{h.label}</Text>
                <Ionicons name="add" size={13} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontSize: 15, fontWeight: "700" },
  count: { fontSize: 12, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 2 },
  duplicateNotice: { fontSize: 12, fontWeight: "600" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 16,
    maxWidth: "100%",
  },
  selectedChipText: { color: "#fff", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  emptyText: { fontSize: 13, fontStyle: "italic" },
  suggestLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestChipText: { fontSize: 12, fontWeight: "600" },
});
