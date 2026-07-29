/**
 * Home / Dashboard (tab 0)
 * Greeting, streak indicator, today's tasks, suggested opportunities, quick actions.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import InlinePageDisclaimer from "../../components/disclaimers/InlinePageDisclaimer";
import { useProfile } from "../../context/ProfileContext";
import { useTime } from "../../context/TimeContext";
import SwipeableTab from "../../components/SwipeableTab";
import TipBanner, { TIP_KEYS } from "../../components/TipBanner";
import FriendsLeaderboard from "../../components/home/FriendsLeaderboard";
import NotificationBell from "../../components/notifications/NotificationBell";
import { useTourScrollRoot } from "../../context/TourTargetsContext";
import { useRef } from "react";
import { localDateISO } from "../../utils/dateUtils";
import { formatTime12h, formatTimeLabel, minutesToNormalizedTime, timeStringToMinutes } from "../../utils/time";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return localDateISO(); }

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return `Good ${part}, ${name || "there"}!`;
}

// ── Quick Actions ────────────────────────────────────────────────────────────
// A small config-driven list instead of two hand-written JSX branches, so
// the Personality Quiz slot can be swapped for Plan Activity once the quiz
// is completed without Home itself remounting or the other slots (Post,
// Feed) shifting identity. Stable `id`s (not array index) are used as the
// TouchableOpacity key so React never confuses the Quiz slot for the Plan
// Activity slot that replaces it.

type QuickAction = {
  id: string;
  label: string;
  icon: string; // Ionicons name
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
};

function buildQuickActions({
  quizLoaded,
  quizCompleted,
  colors,
  onPost,
  onFeed,
  onQuiz,
  onPlanActivity,
}: {
  quizLoaded: boolean;
  quizCompleted: boolean;
  colors: { primary: string };
  onPost: () => void;
  onFeed: () => void;
  onQuiz: () => void;
  onPlanActivity: () => void;
}): QuickAction[] {
  const actions: QuickAction[] = [
    { id: "post", label: "Post", icon: "add-circle-outline", color: colors.primary, onPress: onPost, accessibilityLabel: "Create a post" },
    { id: "feed", label: "Feed", icon: "newspaper-outline", color: "#F59E0B", onPress: onFeed, accessibilityLabel: "Open feed" },
  ];
  // While the completion state is still loading, keep the pre-existing Quiz
  // slot rather than flashing Plan Activity in and possibly back to Quiz a
  // moment later once the real value arrives.
  if (!quizLoaded || !quizCompleted) {
    actions.push({ id: "quiz", label: "Quiz", icon: "help-circle-outline", color: "#8B5CF6", onPress: onQuiz, accessibilityLabel: "Take personality quiz" });
  } else {
    actions.push({
      id: "plan-activity",
      label: "Plan activity",
      icon: "calendar-outline",
      color: "#0EA5E9",
      onPress: onPlanActivity,
      accessibilityLabel: "Plan a new activity. Schedule a task or hobby.",
    });
  }
  return actions;
}

/** A quick-action tile with a small press-in/press-out scale (core Animated API, matching this file's existing convention — no Reanimated import needed just for a one-shot press feedback). */
function AnimatedQuickAction({ action, colors }: { action: QuickAction; colors: any }) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  }
  function pressOut() {
    Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={action.onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={action.accessibilityLabel}
      >
        <View style={[styles.quickActionIcon, { backgroundColor: action.color + "18" }]}>
          <Ionicons name={action.icon as any} size={22} color={action.color} />
        </View>
        <Text style={[styles.quickActionLabel, { color: colors.text }]}>{action.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TodayTaskRow({ id, title, time, duration, completed, type, colors }: { id: string; title: string; time: string; duration: number; completed: boolean; type: string; colors: any }) {
  // Never trust a task's raw `time` field directly — legacy/malformed records
  // (e.g. an incomplete manual entry saved before Planner's time picker
  // enforced a valid HH:mm) must render as "Time not set" instead of
  // crashing this row and, with it, the rest of Home.
  const timeResult = formatTimeLabel(time, { taskId: id });
  // Shown as a "start – end" range (e.g. "12:00 PM – 1:00 PM"), matching the
  // Planner's own task rows — same-day only, clamped at end of day.
  const startMinutes = timeStringToMinutes(time);
  const endTime = startMinutes !== null
    ? minutesToNormalizedTime(Math.min(23 * 60 + 59, startMinutes + duration))
    : null;
  const timeRangeLabel = timeResult.ok && endTime ? `${timeResult.label} – ${formatTime12h(endTime)}` : timeResult.label;
  return (
    <View style={[styles.todayTask, { backgroundColor: colors.card, borderColor: colors.border, opacity: completed ? 0.55 : 1 }]}>
      <View style={[styles.todayTaskDot, { backgroundColor: type === "hobby" ? colors.primary : colors.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.todayTaskTitle, { color: colors.text }, completed && { textDecorationLine: "line-through" }]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[styles.todayTaskTime, { color: timeResult.ok ? colors.secondaryText : colors.danger }]}
        >
          {timeRangeLabel}
        </Text>
      </View>
      {completed && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors } = useTheme();
  const { profile, isLoaded: profileIsLoaded } = useProfile();
  const { tasks } = useTime();
  const homeScrollRoot = useTourScrollRoot("home");

  // Source of truth for "has this user completed the quiz" is the saved
  // result on their own profile document (profile.quizCompletedAt, written
  // by ProfileContext.saveQuizResult) — never a local boolean/AsyncStorage
  // flag, so a fresh install or a different account never shows a stale
  // "completed" state.
  const quizCompleted = profileIsLoaded && profile.quizCompletedAt != null;

  const today = todayISO();
  const todayTasks = tasks
    .filter((t) => t.date === today)
    // Malformed/legacy times (timeStringToMinutes -> null) sort last instead
    // of throwing or corrupting the order of the valid tasks around them.
    .sort((a, b) => (timeStringToMinutes(a.time) ?? Infinity) - (timeStringToMinutes(b.time) ?? Infinity))
    .slice(0, 4);

  const completedToday = todayTasks.filter((t) => t.completed).length;

  return (
    <SwipeableTab tabIndex={0} backgroundColor={colors.background} colors={colors}>
      {/* Bottom safe-area inset is intentionally excluded here: the Tabs
          navigator's own (non-absolute) tab bar already reserves that space
          in its own height, so reserving it again would just add an empty
          gap between this screen's content and the tab bar. */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.disclaimerPad}>
          <InlinePageDisclaimer screenKey="/" colors={colors} />
        </View>

        {/* Header — greeting only; city intentionally removed from this row
            (still shown on Profile/Settings/Explore/friend previews). */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.greeting, { color: colors.text }]} numberOfLines={1}>
              {greeting(profile.username)}
            </Text>
          </View>
          <NotificationBell colors={colors} />
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.logoBtn}
            accessibilityRole="button"
            accessibilityLabel="Go to your profile"
          >
            <Image source={require("../../assets/images/Hobbily_Logo.png")} style={styles.logoBtnImage} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={homeScrollRoot.ref}
          onScroll={homeScrollRoot.onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 56 }}
        >

          <TipBanner
            storageKey={TIP_KEYS.homeGettingStarted}
            text="Plan your first activity, or explore communities near you."
            icon="sparkles-outline"
            colors={colors}
          />

          <View style={styles.content}>
            {/* Today's schedule */}
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Schedule</Text>
                <TouchableOpacity onPress={() => router.push("/(tabs)/time-manager")}>
                  <Text style={[styles.sectionLink, { color: colors.primary }]}>View all</Text>
                </TouchableOpacity>
              </View>

              <View>
                {todayTasks.length === 0 ? (
                  <View style={[styles.emptyToday, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-done-circle-outline" size={32} color={colors.success} />
                    <Text style={[styles.emptyTodayText, { color: colors.secondaryText }]}>
                      Nothing scheduled today — {"\n"}
                      <Text style={{ color: colors.primary, fontWeight: "700" }} onPress={() => router.push("/(tabs)/time-manager")}>
                        Add an activity
                      </Text>
                    </Text>
                  </View>
                ) : (
                  <>
                    {todayTasks.map((t) => (
                      <TodayTaskRow key={t.id} id={t.id} title={t.title} time={t.time} duration={t.duration} completed={t.completed} type={t.type} colors={colors} />
                    ))}
                    {completedToday > 0 && (
                      <View style={[styles.progressMini, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.progressMiniBar, { backgroundColor: colors.border }]}>
                          <View style={[styles.progressMiniFill, { backgroundColor: colors.success, width: `${(completedToday / todayTasks.length) * 100}%` as any }]} />
                        </View>
                        <Text style={[styles.progressMiniText, { color: colors.secondaryText }]}>
                          {completedToday}/{todayTasks.length} done today
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* Quick actions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
              <View style={styles.quickActions}>
                {buildQuickActions({
                  quizLoaded: profileIsLoaded,
                  quizCompleted,
                  colors,
                  onPost: () => router.push("/create-post" as any),
                  onFeed: () => router.push("/feed" as any),
                  onQuiz: () => router.push("/quiz" as any),
                  // Just navigates — no auto-opened form, no auto-picked date,
                  // no AI launch. Planner's own "Plan an activity" section is
                  // where the user actually chooses how to add something.
                  onPlanActivity: () => router.push("/(tabs)/time-manager"),
                }).map((a) => (
                  <AnimatedQuickAction key={a.id} action={a} colors={colors} />
                ))}
              </View>
            </View>

            {/* Friends streak leaderboard */}
            <FriendsLeaderboard colors={colors} />
          </View>

        </ScrollView>
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  disclaimerPad: { paddingHorizontal: 16, paddingTop: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  greeting: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  logoBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  logoBtnImage: { width: 32, height: 32, borderRadius: 16, resizeMode: "contain" },
  content: { paddingHorizontal: 16, marginTop: 16, gap: 24 },
  section: { gap: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sectionLink: { fontSize: 13, fontWeight: "600" },
  // Today tasks
  todayTask: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  todayTaskDot: { width: 8, height: 8, borderRadius: 4 },
  todayTaskTitle: { fontSize: 16, fontWeight: "600" },
  todayTaskTime: { fontSize: 13, marginTop: 2 },
  emptyToday: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 8 },
  emptyTodayText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  progressMini: { padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 4, gap: 6 },
  progressMiniBar: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressMiniFill: { height: "100%", borderRadius: 3 },
  progressMiniText: { fontSize: 12, textAlign: "right" },
  // Quick actions
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: { flex: 1, alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, gap: 6 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 11, fontWeight: "600", textAlign: "center" },
});
