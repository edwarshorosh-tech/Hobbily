/**
 * PostCardSkeleton — loading placeholder shaped like PostCard, shown while
 * the first page of posts (or comments) is still loading. Static (no
 * shimmer animation dependency) — a plain themed block is enough signal and
 * keeps this dependency-free.
 */
import { View, StyleSheet } from "react-native";

export default function PostCardSkeleton({ colors }: { colors: any }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.border }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.line, { backgroundColor: colors.border, width: "40%" }]} />
          <View style={[styles.line, { backgroundColor: colors.border, width: "60%", height: 8 }]} />
        </View>
      </View>
      <View style={[styles.line, { backgroundColor: colors.border, width: "90%", marginTop: 12 }]} />
      <View style={[styles.line, { backgroundColor: colors.border, width: "70%", marginTop: 8 }]} />
      <View style={[styles.line, { backgroundColor: colors.border, width: "50%", marginTop: 8 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 16, borderWidth: 1, marginVertical: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  line: { height: 10, borderRadius: 5 },
});
