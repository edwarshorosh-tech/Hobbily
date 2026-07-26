/**
 * AvatarPickerSheet — "Choose from library / Remove photo / Cancel" for the
 * profile photo, opened by tapping the avatar or its edit icon. Uses the
 * shared BottomSheet shell, not a bespoke modal. Picking and removal
 * themselves are handled by the caller (app/(tabs)/profile.tsx) via
 * context/LocalAvatarContext.tsx — this component only presents the choice.
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import BottomSheet from "../BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  onChooseFromLibrary: () => void;
  onRemovePhoto: () => void;
  /** Whether there's currently a photo to remove — hides that row entirely when there isn't, rather than showing a disabled/no-op action. */
  hasPhoto: boolean;
  colors: ColorTokens;
};

export default function AvatarPickerSheet({ visible, onClose, onChooseFromLibrary, onRemovePhoto, hasPhoto, colors }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="34%">
      <Text style={[styles.title, { color: colors.text }]}>Profile photo</Text>
      <View style={{ gap: 4, marginTop: 4 }}>
        <TouchableOpacity
          onPress={() => {
            onClose();
            onChooseFromLibrary();
          }}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel="Choose from library"
        >
          <Ionicons name="image-outline" size={19} color={colors.text} />
          <Text style={[styles.rowText, { color: colors.text }]}>Choose from library</Text>
        </TouchableOpacity>
        {hasPhoto && (
          <TouchableOpacity
            onPress={() => {
              onClose();
              onRemovePhoto();
            }}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={[styles.rowText, { color: colors.danger }]}>Remove photo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose} style={styles.row} accessibilityRole="button" accessibilityLabel="Cancel">
          <Ionicons name="close" size={19} color={colors.secondaryText} />
          <Text style={[styles.rowText, { color: colors.secondaryText }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.disclosure, { color: colors.secondaryText }]}>This photo is stored only on this device.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 44 },
  rowText: { fontSize: 15, fontWeight: "600" },
  disclosure: { fontSize: 11, marginTop: 8, marginBottom: 4 },
});
