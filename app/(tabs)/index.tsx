/**
 * Home / Dashboard (tab 0)
 * Greeting, streak indicator, today's tasks, suggested opportunities, quick actions.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import { useTime, TaskSaveResult } from "../../context/TimeContext";
import { useProgress } from "../../context/ProgressContext";
import SwipeableTab from "../../components/SwipeableTab";
import TipBanner, { TIP_KEYS } from "../../components/TipBanner";
import FriendsLeaderboard from "../../components/home/FriendsLeaderboard";
import NotificationBell from "../../components/notifications/NotificationBell";
import StreakInfoModal from "../../components/home/StreakInfoModal";
import StreakButton from "../../components/home/StreakButton";
import { useRef, useState } from "react";
import { localDateISO, parseLocalISO } from "../../utils/dateUtils";
import { formatTime12h, formatTimeLabel, minutesToNormalizedTime, timeStringToMinutes } from "../../utils/time";
import { Task } from "../../types/Task";
import {
  AiAssistantServiceError,
  ChatMessage,
  friendlyAiAssistantMessage,
  isAiAssistantConfigured,
  sendChatMessage,
} from "../../services/aiAssistantService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return localDateISO(); }

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return `Good ${part}, ${name || "there"}!`;
}

/** "Jul 22" — short enough for an inline confirmation bubble. */
function formatShortDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── AI Assistant ─────────────────────────────────────────────────────────────
// A real back-and-forth conversation with server-side memory: every turn
// resends the transcript to the Worker (worker/ -> Gemini API free tier),
// which can either just reply, or call its one tool to schedule something —
// see services/aiAssistantService.ts. Whenever it does, the returned
// activity is created through the exact same addTask() used by the manual
// Add Activity flow; no second activity model, no direct Firestore write here.

/** One bubble in the on-screen thread. `isError` bubbles are shown but never resent to Gemini as conversation history — they're a local failure notice, not something the assistant said. */
type DisplayMessage = { id: number; role: ChatRole; text: string; isError?: boolean };
type ChatRole = "user" | "assistant";

function AIAssistantCard({
  colors,
  addTask,
}: {
  colors: any;
  addTask: (task: Omit<Task, "id" | "createdAt">) => Promise<TaskSaveResult>;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const nextId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  function pushMessage(role: ChatRole, text: string, isError = false) {
    nextId.current += 1;
    setMessages((prev) => [...prev, { id: nextId.current, role, text, isError }]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    pushMessage("user", text);

    // Only real conversational turns count as memory — a local error bubble
    // was never something the assistant actually said, so it's excluded here
    // even though it's still visible in the thread above.
    const history: ChatMessage[] = [
      ...messages.filter((m) => !m.isError).map(({ role, text: t }) => ({ role, text: t })),
      { role: "user", text },
    ];

    try {
      const reply = await sendChatMessage(history);

      if (reply.kind === "message") {
        pushMessage("assistant", reply.text);
        return;
      }

      // A confirmed action — actually write it through the same addTask()
      // path the manual Add Activity sheet uses, then report the real
      // outcome (which might differ from what Gemini assumed, e.g. a
      // conflict it couldn't have known about) so the transcript — and the
      // assistant's memory of what happened — stays honest.
      const { activity } = reply;
      const result = await addTask({
        title: activity.title,
        type: activity.type,
        date: activity.date,
        time: activity.time,
        duration: activity.duration,
        completed: false,
      });

      const timeLabel = formatTimeLabel(activity.time).label;
      const outcome = result.ok
        ? `Added "${activity.title}" — ${formatShortDate(activity.date)} at ${timeLabel}.`
        : result.reason === "conflict"
        ? `That overlaps with "${result.conflict.title}" at ${formatTimeLabel(result.conflict.time).label} — try a different time.`
        : "That's in the past — try a current or future date/time.";

      pushMessage("assistant", reply.text ? `${reply.text} ${outcome}` : outcome);
    } catch (e) {
      if (__DEV__) console.warn("[AIAssistantCard] sendChatMessage failed", e);
      pushMessage("assistant", friendlyAiAssistantMessage(e), true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.aiHeaderRow}>
        <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        <Text style={[styles.aiTitle, { color: colors.text }]}>AI Assistant</Text>
      </View>
      <Text style={[styles.aiSubtitle, { color: colors.secondaryText }]}>
        Chat naturally — ask a question, talk through your plans, or say "add it" and I'll schedule it.
      </Text>
      {!isAiAssistantConfigured && (
        <View style={[styles.aiNotConfiguredBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.secondaryText} />
          <Text style={[styles.aiNotConfiguredText, { color: colors.secondaryText }]}>
            The AI assistant isn't set up yet — add activities manually for now.
          </Text>
        </View>
      )}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={styles.aiThread}
          contentContainerStyle={{ paddingVertical: 4 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.aiBubble,
                m.role === "user" ? styles.aiBubbleUser : styles.aiBubbleAssistant,
                m.role === "user"
                  ? { backgroundColor: colors.primary }
                  : {
                      backgroundColor: m.isError ? colors.danger + "18" : colors.background,
                      borderWidth: 1,
                      borderColor: m.isError ? colors.danger : colors.border,
                    },
              ]}
            >
              <Text style={{ color: m.role === "user" ? "#fff" : m.isError ? colors.danger : colors.text, fontSize: 13 }}>
                {m.text}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.aiBubble, styles.aiBubbleAssistant, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.secondaryText} />
            </View>
          )}
        </ScrollView>
      )}
      <View style={styles.aiInputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder='e.g. "Is football a good idea for tomorrow?"'
          placeholderTextColor={colors.secondaryText}
          style={[styles.aiInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          editable={!loading}
          multiline
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={loading || !input.trim()}
          style={[styles.aiSendBtn, { backgroundColor: colors.primary, opacity: loading || !input.trim() ? 0.6 : 1 }]}
        >
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
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
  const { profile } = useProfile();
  const { tasks, addTask } = useTime();
  const { currentStreak } = useProgress();
  const [streakModalVisible, setStreakModalVisible] = useState(false);

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
        {/* Header — greeting only; city intentionally removed from this row
            (still shown on Profile/Settings/Explore/friend previews). */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.greeting, { color: colors.text }]} numberOfLines={1}>
              {greeting(profile.username)}
            </Text>
          </View>
          <NotificationBell colors={colors} />
          <StreakButton streak={currentStreak ?? 0} colors={colors} onPress={() => setStreakModalVisible(true)} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 56 }}>

          <TipBanner
            storageKey={TIP_KEYS.homeGettingStarted}
            text="Add your first activity with AI, or explore communities near you."
            icon="sparkles-outline"
            colors={colors}
          />

          <View style={styles.content}>
            {/* AI Assistant */}
            <AIAssistantCard colors={colors} addTask={addTask} />

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
                {[
                  { icon: "add-circle-outline" as const, label: "Post", action: () => router.push("/create-post" as any), color: colors.primary },
                  { icon: "newspaper-outline" as const, label: "Feed", action: () => router.push("/feed" as any), color: "#F59E0B" },
                  // Once the quiz is completed (a persisted profile field, not
                  // local/component state — see types/Profile.ts
                  // quizCompletedAt), this slot switches from "take the quiz"
                  // to "Explore", since retaking it lives in Profile/Settings
                  // now rather than being a primary Quick Action.
                  profile.quizCompletedAt
                    ? { icon: "compass-outline" as const, label: "Explore", action: () => router.push("/(tabs)/opportunities" as any), color: "#8B5CF6" }
                    : { icon: "help-circle-outline" as const, label: "Quiz", action: () => router.push("/quiz" as any), color: "#8B5CF6" },
                ].map((a) => (
                  <TouchableOpacity key={a.label} onPress={a.action} style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.quickActionIcon, { backgroundColor: a.color + "18" }]}>
                      <Ionicons name={a.icon} size={22} color={a.color} />
                    </View>
                    <Text style={[styles.quickActionLabel, { color: colors.text }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Friends streak leaderboard */}
            <FriendsLeaderboard colors={colors} />
          </View>

        </ScrollView>

        <StreakInfoModal
          visible={streakModalVisible}
          onClose={() => setStreakModalVisible(false)}
          colors={colors}
        />
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  greeting: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, marginTop: 16, gap: 24 },
  section: { gap: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sectionLink: { fontSize: 13, fontWeight: "600" },
  // Today tasks
  todayTask: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  todayTaskDot: { width: 8, height: 8, borderRadius: 4 },
  todayTaskTitle: { fontSize: 14, fontWeight: "600" },
  todayTaskTime: { fontSize: 12, marginTop: 1 },
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
  // AI Assistant
  aiCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  aiHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiTitle: { fontSize: 15, fontWeight: "700" },
  aiSubtitle: { fontSize: 12, marginTop: 4, marginBottom: 10 },
  aiNotConfiguredBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  aiNotConfiguredText: { fontSize: 11, flex: 1, lineHeight: 15 },
  aiThread: { maxHeight: 220, marginBottom: 10 },
  aiBubble: { maxWidth: "85%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  aiBubbleUser: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubbleAssistant: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  aiInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 90,
  },
  aiSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
