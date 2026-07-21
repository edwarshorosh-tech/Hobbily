/**
 * LocalitySearchInput — real Israeli locality autocomplete for the
 * registration/profile city field (see utils/israeliLocalities.ts for the
 * data source). Used by both onboarding.tsx (light onboardingTheme) and
 * profile.tsx's Settings tab (light/dark app theme) — takes plain
 * ColorTokens-shaped colors so it isn't tied to either screen's theme.
 *
 * onChange only fires on an explicit action — tapping a suggestion, or
 * tapping "Use as my location" in the no-match state — never on every
 * keystroke, so a typo never gets silently accepted as the stored value.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../context/ThemeContext";
import { Locality, searchLocalities } from "../utils/israeliLocalities";

type Props = {
  value: string;
  onChange: (city: string, meta: { localityId: string | null; locationSource: "official" | "custom" }) => void;
  colors: ColorTokens;
  placeholder?: string;
};

export default function LocalitySearchInput({ value, onChange, colors, placeholder }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const trimmed = query.trim();
  const results: Locality[] = trimmed.length > 0 ? searchLocalities(trimmed) : [];
  const showNoMatch = open && trimmed.length > 0 && results.length === 0;

  function selectLocality(locality: Locality) {
    setQuery(locality.nameEn);
    setOpen(false);
    onChange(locality.nameEn, { localityId: locality.localityId, locationSource: "official" });
  }

  function confirmCustom() {
    setOpen(false);
    onChange(trimmed, { localityId: null, locationSource: "custom" });
  }

  return (
    <View>
      <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="location-outline" size={16} color={colors.secondaryText} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={placeholder ?? "Search your city, town, or village"}
          placeholderTextColor={colors.secondaryText}
          value={query}
          onChangeText={(t) => { setQuery(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(""); setOpen(false); }} accessibilityRole="button" accessibilityLabel="Clear city">
            <Ionicons name="close-circle" size={16} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {open && results.length > 0 && (
        <ScrollView style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled">
          {results.map((locality) => (
            <TouchableOpacity
              key={locality.localityId}
              style={styles.resultRow}
              onPress={() => selectLocality(locality)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${locality.nameEn}`}
            >
              <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={1}>{locality.nameEn}</Text>
              <Text style={[styles.resultSubtext, { color: colors.secondaryText }]} numberOfLines={1}>{locality.nameHe}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {showNoMatch && (
        <View style={[styles.noMatchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.noMatchText, { color: colors.secondaryText }]}>No locality found</Text>
          <TouchableOpacity onPress={confirmCustom} style={styles.noMatchAction} accessibilityRole="button" accessibilityLabel={`Use "${trimmed}" as my location`}>
            <Text style={[styles.noMatchActionText, { color: colors.primary }]}>Use &quot;{trimmed}&quot; as my location</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  input: { flex: 1, fontSize: 15, paddingVertical: 10 },
  dropdown: { borderWidth: 1, borderRadius: 12, marginTop: 6, maxHeight: 260, overflow: "hidden" },
  resultRow: { paddingHorizontal: 12, paddingVertical: 10 },
  resultText: { fontSize: 14, fontWeight: "600" },
  resultSubtext: { fontSize: 12, marginTop: 1 },
  noMatchBox: { borderWidth: 1, borderRadius: 12, marginTop: 6, padding: 12, gap: 6 },
  noMatchText: { fontSize: 13 },
  noMatchAction: { alignSelf: "flex-start" },
  noMatchActionText: { fontSize: 13, fontWeight: "700" },
});
