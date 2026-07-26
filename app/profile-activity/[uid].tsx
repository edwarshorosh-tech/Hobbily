/**
 * Profile activity — the real list behind a profile's "Communities"/
 * "Workshops" stat counts (see components/profile/ProfileStatGrid.tsx's
 * onPress cells, wired from app/(tabs)/profile.tsx and app/user/[uid].tsx).
 * One route with a `tab` query param rather than two separate screens, so
 * the counts and the lists they open are never two different code paths
 * that could silently disagree.
 *
 * Both communities and workshops are fully public data today — no privacy/
 * visibility system exists yet for either (see communityService.ts's own
 * doc comment: "No channel is currently private"; workshopParticipants has
 * no visibility field at all) — so, honestly, there is nothing to filter
 * between viewing your own activity and someone else's; both show the same
 * real Firestore-backed list. If a privacy system is added later, this is
 * the one place that would need to start filtering.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { DEFAULT_CHANNELS } from "../../context/CommunityContext";
import { fetchUserCommunities } from "../../services/communityService";
import { fetchUserWorkshops } from "../../services/workshopService";
import { CommunityMembership } from "../../types/CommunityMessage";
import { WorkshopParticipant } from "../../types/Workshop";
import { opportunityById } from "../../constants/opportunities";

type Tab = "communities" | "workshops";

export default function ProfileActivityScreen() {
  const { uid, tab: initialTab } = useLocalSearchParams<{ uid: string; tab?: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isOwn = user?.uid === uid;

  const [tab, setTab] = useState<Tab>(initialTab === "workshops" ? "workshops" : "communities");

  const [communities, setCommunities] = useState<CommunityMembership[] | null>(null);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopParticipant[] | null>(null);
  const [workshopsError, setWorkshopsError] = useState<string | null>(null);

  function loadCommunities() {
    if (!uid) return;
    setCommunitiesError(null);
    fetchUserCommunities(uid)
      .then(setCommunities)
      .catch((e) => {
        if (__DEV__) console.warn("[ProfileActivity] failed to load communities", e);
        setCommunitiesError("Couldn't load communities. Please try again.");
      });
  }

  function loadWorkshops() {
    if (!uid) return;
    setWorkshopsError(null);
    fetchUserWorkshops(uid)
      .then(setWorkshops)
      .catch((e) => {
        if (__DEV__) console.warn("[ProfileActivity] failed to load workshops", e);
        setWorkshopsError("Couldn't load workshops. Please try again.");
      });
  }

  // Both load once up front (not lazily per-tab) — this screen only exists
  // because the user already tapped a specific count, so the other tab is
  // one press away and shouldn't show a fresh spinner too.
  useEffect(() => {
    loadCommunities();
    loadWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{isOwn ? "Your Activity" : "Activity"}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["communities", "workshops"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabPill, tab === t && { backgroundColor: colors.primary }]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabPillText, { color: tab === t ? "#fff" : colors.secondaryText }]}>
              {t === "communities" ? "Communities" : "Workshops"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {tab === "communities" ? (
          communitiesError ? (
            <ErrorState message={communitiesError} onRetry={loadCommunities} colors={colors} />
          ) : communities === null ? (
            <ActivityIndicator size="small" color={colors.secondaryText} style={{ marginTop: 24 }} />
          ) : communities.length === 0 ? (
            <EmptyState
              icon="people-outline"
              message={isOwn ? "You have not joined any communities yet." : "No communities are available to view."}
              colors={colors}
            />
          ) : (
            communities.map((m) => {
              const channel = DEFAULT_CHANNELS.find((c) => c.id === m.channelId);
              if (!channel) return null;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push("/(tabs)/community" as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${channel.name} community`}
                >
                  <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name={channel.icon as any} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{channel.name}</Text>
                    <Text style={[styles.cardSub, { color: colors.secondaryText }]} numberOfLines={1}>{channel.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
                </TouchableOpacity>
              );
            })
          )
        ) : workshopsError ? (
          <ErrorState message={workshopsError} onRetry={loadWorkshops} colors={colors} />
        ) : workshops === null ? (
          <ActivityIndicator size="small" color={colors.secondaryText} style={{ marginTop: 24 }} />
        ) : workshops.length === 0 ? (
          <EmptyState
            icon="school-outline"
            message={isOwn ? "You have not registered for any workshops yet." : "No workshops are available to view."}
            colors={colors}
          />
        ) : (
          workshops.map((w) => {
            const opp = opportunityById(w.workshopId);
            if (!opp) return null;
            return (
              <TouchableOpacity
                key={w.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/(tabs)/opportunities" as any)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${opp.name} workshop`}
              >
                <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
                  <Ionicons name="school-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{opp.name}</Text>
                  <Text style={[styles.cardSub, { color: colors.secondaryText }]} numberOfLines={1}>{opp.organisation} · {opp.category}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ icon, message, colors }: { icon: keyof typeof Ionicons.glyphMap; message: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={28} color={colors.secondaryText} />
      <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{message}</Text>
    </View>
  );
}

function ErrorState({ message, onRetry, colors }: { message: string; onRetry: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.secondaryText} />
      <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{message}</Text>
      <TouchableOpacity onPress={onRetry} style={[styles.retryBtn, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Retry">
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  tabRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginHorizontal: 16, marginTop: 12 },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabPillText: { fontSize: 13, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  cardSub: { fontSize: 12, marginTop: 2 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
});
