/**
 * RepeatSettings — the "Repeat" block in the Add/Edit Activity sheet
 * (app/(tabs)/time-manager.tsx). Purely a controlled view: every value it
 * shows comes from props, every change goes back out through a callback —
 * the actual RecurrenceRule construction and date-picking UI stay in the
 * parent (TaskModal), the same way Start/End time already work there.
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { NormalizedTime } from "../../utils/time";
import { RecurrenceRule } from "../../types/Recurrence";
import { summarizeRecurrence } from "../../utils/recurrenceSummary";

export type RepeatPreset = "daily" | "weekdays" | "weekend" | "custom";

const PRESET_LABELS: { value: RepeatPreset; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekend", label: "Weekends" },
  { value: "custom", label: "Custom" },
];

/** M T W T F S S — short chip labels; accessibilityLabel below always carries the full name so this never relies on the abbreviation alone. */
const WEEKDAY_CHIPS: { day: number; short: string; full: string }[] = [
  { day: 1, short: "M", full: "Monday" },
  { day: 2, short: "T", full: "Tuesday" },
  { day: 3, short: "W", full: "Wednesday" },
  { day: 4, short: "T", full: "Thursday" },
  { day: 5, short: "F", full: "Friday" },
  { day: 6, short: "S", full: "Saturday" },
  { day: 7, short: "S", full: "Sunday" },
];

type Props = {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  preset: RepeatPreset;
  onPresetChange: (preset: RepeatPreset) => void;
  customWeekdays: number[];
  onToggleCustomWeekday: (day: number) => void;
  endsMode: "never" | "on_date";
  onEndsModeChange: (mode: "never" | "on_date") => void;
  untilDateLabel: string | null;
  onRequestPickUntilDate: () => void;
  /** Built by the parent from current preset/customWeekdays/endsMode/untilDate — passed in rather than recomputed here so TaskModal's single source of truth for "what rule would this produce" stays in one place. */
  previewRule: RecurrenceRule | null;
  startTime: NormalizedTime;
  colors: ColorTokens;
  disabled?: boolean;
  /** "Custom" with zero days selected — shown inline, Save is disabled by the parent, the sheet never force-closes. */
  customDaysError?: string | null;
};

export default function RepeatSettings({
  enabled,
  onToggleEnabled,
  preset,
  onPresetChange,
  customWeekdays,
  onToggleCustomWeekday,
  endsMode,
  onEndsModeChange,
  untilDateLabel,
  onRequestPickUntilDate,
  previewRule,
  startTime,
  colors,
  disabled,
  customDaysError,
}: Props) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => onToggleEnabled(!enabled)}
        disabled={disabled}
        style={styles.headerRow}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled, disabled }}
        accessibilityLabel="Repeat"
      >
        <View style={styles.headerLabel}>
          <Ionicons name="repeat" size={16} color={colors.secondaryText} style={{ marginRight: 6 }} />
          <Text style={[styles.headerText, { color: colors.text }]}>Repeat</Text>
        </View>
        <View
          style={[
            styles.switchTrack,
            { backgroundColor: enabled ? colors.primary : colors.border },
          ]}
        >
          <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
        </View>
      </TouchableOpacity>

      {enabled && (
        <View style={styles.body}>
          <View style={styles.presetRow}>
            {PRESET_LABELS.map((p) => {
              const active = preset === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => onPresetChange(p.value)}
                  disabled={disabled}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: active ? colors.primary : colors.inputBackground,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={p.label}
                >
                  <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "700", fontSize: 12.5 }}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {preset === "custom" && (
            <View style={styles.customWrap}>
              <View style={styles.dayChipsRow}>
                {WEEKDAY_CHIPS.map(({ day, short, full }) => {
                  const selected = customWeekdays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      onPress={() => onToggleCustomWeekday(day)}
                      disabled={disabled}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.inputBackground,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={full}
                    >
                      <Text style={{ color: selected ? "#fff" : colors.secondaryText, fontWeight: "800", fontSize: 13 }}>{short}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {customDaysError && (
                <Text style={[styles.errorText, { color: colors.danger }]}>{customDaysError}</Text>
              )}
            </View>
          )}

          <View style={[styles.endsRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.endsLabel, { color: colors.secondaryText }]}>Ends</Text>
            <View style={styles.endsOptions}>
              <TouchableOpacity
                onPress={() => onEndsModeChange("never")}
                disabled={disabled}
                style={[
                  styles.endsChip,
                  { backgroundColor: endsMode === "never" ? colors.primary : colors.inputBackground, borderColor: endsMode === "never" ? colors.primary : colors.border },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: endsMode === "never" }}
                accessibilityLabel="Never ends"
              >
                <Text style={{ color: endsMode === "never" ? "#fff" : colors.text, fontWeight: "700", fontSize: 12.5 }}>Never</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onEndsModeChange("on_date")}
                disabled={disabled}
                style={[
                  styles.endsChip,
                  { backgroundColor: endsMode === "on_date" ? colors.primary : colors.inputBackground, borderColor: endsMode === "on_date" ? colors.primary : colors.border },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: endsMode === "on_date" }}
                accessibilityLabel="Ends on a specific date"
              >
                <Text style={{ color: endsMode === "on_date" ? "#fff" : colors.text, fontWeight: "700", fontSize: 12.5 }}>On date</Text>
              </TouchableOpacity>
            </View>
          </View>

          {endsMode === "on_date" && (
            <TouchableOpacity
              onPress={onRequestPickUntilDate}
              disabled={disabled}
              style={[styles.untilRow, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={untilDateLabel ? `Ends on ${untilDateLabel}. Double tap to change.` : "Choose end date"}
            >
              <Ionicons name="calendar-outline" size={15} color={colors.secondaryText} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>{untilDateLabel ?? "Choose end date"}</Text>
              <Ionicons name="chevron-down" size={15} color={colors.secondaryText} />
            </TouchableOpacity>
          )}

          {previewRule && !customDaysError && (
            <Text style={[styles.summary, { color: colors.secondaryText }]}>{summarizeRecurrence(previewRule, startTime)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, minHeight: 44 },
  headerLabel: { flexDirection: "row", alignItems: "center" },
  headerText: { fontSize: 15, fontWeight: "700" },
  switchTrack: { width: 46, height: 27, borderRadius: 14, padding: 2, justifyContent: "center" },
  switchThumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#fff" },
  switchThumbOn: { alignSelf: "flex-end" },
  body: { gap: 10, marginTop: 2 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  customWrap: { gap: 6 },
  dayChipsRow: { flexDirection: "row", gap: 6 },
  dayChip: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 12, fontWeight: "600" },
  endsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  endsLabel: { fontSize: 13, fontWeight: "600" },
  endsOptions: { flexDirection: "row", gap: 8 },
  endsChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  untilRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12 },
  summary: { fontSize: 12.5, fontStyle: "italic", marginTop: 2 },
});
