/**
 * SectionCardHeader — shared header row for Profile Overview section cards
 * (Friends, My Hobbies). Keeps icon size, title typography, count styling,
 * and the right-side action slot identical across cards.
 */
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  colors: ColorTokens;
  /** Right-side slot — e.g. an add-friend button or a "Show all" chevron action. */
  action?: ReactNode;
};

export default function SectionCardHeader({ icon, title, count, colors, action }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {icon ? <Ionicons name={icon} size={16} color={colors.secondaryText} /> : null}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {typeof count === "number" ? (
          <Text style={[styles.count, { color: colors.secondaryText }]}>{count}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
  left: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  title: { fontSize: 17, fontWeight: "800" },
  count: { fontSize: 14, fontWeight: "600" },
});
