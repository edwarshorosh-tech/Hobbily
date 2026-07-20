/**
 * HobbiesShowAllModal — "Show all (N)" bottom sheet for the Overview My
 * Hobbies card. Read-only: no add/remove controls (those live in Settings).
 * Built on the shared BottomSheet primitive (same one Notifications/Streak
 * use) so it gets identical chrome, animation, and desktop/tablet width
 * capping for free.
 */
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import TagChip from "../TagChip";
import BottomSheet from "../BottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  hobbies: string[];
  colors: ColorTokens;
};

export default function HobbiesShowAllModal({ visible, onClose, hobbies, colors }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>My Hobbies</Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
        <View style={styles.tagWrap}>
          {hobbies.map((tag) => (
            <TagChip key={tag} label={tag} variant="tinted" colors={colors} />
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 14 },
  title: { fontSize: 19, fontWeight: "800" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 },
});
