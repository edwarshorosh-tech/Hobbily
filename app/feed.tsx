/**
 * Community Feed screen
 * Paginated, pull-to-refresh feed of all posts, newest first. Navigated to
 * from the Home quick actions button.
 */
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl,
} from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { usePosts } from "../context/PostsContext";
import { useAuthorProfiles } from "../hooks/useAuthorProfiles";
import PostCard from "../components/PostCard";
import PostCardSkeleton from "../components/post/PostCardSkeleton";
import UserCardSheet from "../components/user-card/UserCardSheet";
import { Post } from "../types/Post";

export default function FeedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { posts, isLoading, loadError, hasMore, loadingMore, loadMore, refresh, deletePost } = usePosts();
  const authorProfiles = useAuthorProfiles(posts.map((p) => p.authorId));
  const [refreshing, setRefreshing] = useState(false);
  const [cardUid, setCardUid] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Community Feed</Text>
        <TouchableOpacity onPress={() => router.push("/create-post")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Create post">
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <PostCardSkeleton key={i} colors={colors} />
          ))}
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.secondaryText} />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{loadError}</Text>
          <TouchableOpacity onPress={refresh} style={[styles.createBtn, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.createBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="newspaper-outline" size={48} color={colors.secondaryText} />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            No posts yet — be the first!
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/create-post")}
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.createBtnText}>Create a Post</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.list, { paddingBottom: 16 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={hasMore ? loadMore : undefined}
          renderItem={({ item }: { item: Post }) => (
            <PostCard
              post={item}
              colors={colors}
              authorAvatarUrl={authorProfiles.get(item.authorId)?.avatarUrl}
              onEdit={() => router.push(`/edit-post/${item.id}` as any)}
              onDelete={() => deletePost(item.id)}
              onOpenUser={setCardUid}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.secondaryText} />
              </View>
            ) : null
          }
        />
      )}

      <UserCardSheet uid={cardUid} colors={colors} onClose={() => setCardUid(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontSize: 16, textAlign: "center" },
  createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  list: { padding: 16 },
});
