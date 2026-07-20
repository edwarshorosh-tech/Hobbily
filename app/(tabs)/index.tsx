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
import { interpretMessage, formatShortDate, formatTimeAMPM } from "../../services/aiService";
import FriendsLeaderboard from "../../components/home/FriendsLeaderboard";
import NotificationBell from "../../components/notifications/NotificationBell";
import StreakInfoModal from "../../components/home/StreakInfoModal";
import StreakButton from "../../components/home/StreakButton";
import { useState } from "react";
import { localDateISO } from "../../utils/dateUtils";
import { formatTimeLabel, timeStringToMinutes } from "../../utils/time";
import { Task } from "../../types/Task";
import { AiAssistantServiceError, friendlyAiAssistantMessage, isAiAssistantConfigured, parseActivityRequest } from "../../services/aiAssistantService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return localDateISO(); }

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return `Good ${part}, ${name || "there"}!`;
}

// ── AI Assistant ─────────────────────────────────────────────────────────────
// Free-time questions and exam mentions are answered locally (services/aiService.ts).
// Plain scheduling requests are parsed server-side (worker/ -> Hugging Face
// Inference Providers -> validated JSON) — see services/aiAssistantService.ts.
// Either way the parsed activity is created through the exact same addTask()
// used by the manual Add Activity flow; no second activity model, no direct
// Firestore write here.

function AIAssistantCard({
  colors,
  addTask,
  tasks,
}: {
  colors: any;
  addTask: (task: Omit<Task, "id" | "createdAt">) => Promise<TaskSaveResult>;
  tasks: Task[];
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setFeedback(null);

    // Free-time questions and exam mentions are handled locally (the backend
    // parser only understands single-activity scheduling) — everything else
    // goes to the real AI backend.
    const action = interpretMessage(text, tasks, todayISO());

    if (action.kind === "free_info") {
      setFeedback({ ok: true, message: action.message });
      setInput("");
      setLoading(false);
      return;
    }

    if (action.kind === "exam") {
      try {
        const examResult = await addTask({
          title: action.label,
          type: "task",
          date: action.date,
          time: action.time,
          duration: 60,
          completed: false,
        });
        if (!examResult.ok) {
          setFeedback({
            ok: false,
            message:
              examResult.reason === "conflict"
                ? `That overlaps with "${examResult.conflict.title}" at ${examResult.conflict.time} — try a different time for your ${action.label.toLowerCase()}.`
                : "That date/time is in the past — double-check it.",
          });
          return;
        }

        let studyAdded = 0;
        const studyDates: string[] = [];
        for (const session of action.studySessions) {
          const r = await addTask({ title: session.title, type: "task", date: session.date, time: session.time, duration: session.duration, completed: false });
          if (r.ok) {
            studyAdded++;
            studyDates.push(formatShortDate(session.date));
          }
        }

        const guessNote = action.timeWasGuessed ? ` (I guessed ${formatTimeAMPM(action.time)} — adjust it in your planner if needed)` : "";
        const studyNote =
          studyAdded > 0
            ? ` I also blocked ${studyAdded} study session${studyAdded > 1 ? "s" : ""} on ${studyDates.join(", ")} so you're not cramming.`
            : action.studySessions.length === 0
            ? " I couldn't find open time beforehand to schedule prep sessions — good luck!"
            : "";
        setFeedback({ ok: true, message: `Added "${action.label}" on ${formatShortDate(action.date)}${guessNote}.${studyNote}` });
        setInput("");
      } catch (e) {
        if (__DEV__) console.warn("[AIAssistantCard] exam scheduling failed", e);
        setFeedback({ ok: false, message: "Couldn't save that — please try again." });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Checked upfront rather than only discovered via the thrown error below —
    // lets the UI show a persistent notice (see aiNotConfiguredBanner). Falls
    // back to the local regex parser's own result instead of just failing, so
    // plain scheduling still works offline like it did before the AI backend
    // was added.
    if (!isAiAssistantConfigured) {
      if (action.kind === "schedule") {
        const result = await addTask({
          title: action.title,
          type: "task",
          date: action.date,
          time: action.time,
          duration: 60,
          completed: false,
        });
        if (result.ok) {
          setFeedback({ ok: true, message: `Scheduled "${action.title}" — ${formatShortDate(action.date)} at ${action.time}` });
          setInput("");
        } else if (result.reason === "conflict") {
          setFeedback({ ok: false, message: `That overlaps with "${result.conflict.title}" at ${result.conflict.time} — try a different time.` });
        } else {
          setFeedback({ ok: false, message: "That's in the past — try a current or future date/time." });
        }
      } else {
        setFeedback({
          ok: false,
          message: 'Couldn’t quite parse that — try "Soccer practice next Tuesday at 7pm".',
        });
      }
      setLoading(false);
      return;
    }

    try {
      const parsed = await parseActivityRequest(text);
      const result = await addTask({
        title: parsed.title,
        type: parsed.type,
        date: parsed.date,
        time: parsed.time,
        duration: parsed.duration,
        completed: false,
      });
      if (result.ok) {
        setFeedback({ ok: true, message: `Scheduled "${parsed.title}" — ${formatShortDate(parsed.date)} at ${parsed.time}` });
        setInput("");
      } else if (result.reason === "conflict") {
        setFeedback({ ok: false, message: `That overlaps with "${result.conflict.title}" at ${result.conflict.time} — try a different time.` });
      } else {
        setFeedback({ ok: false, message: "That's in the past — try a current or future date/time." });
      }
    } catch (e) {
      if (__DEV__) console.warn("[AIAssistantCard] parseActivityRequest failed", e);
      const code = e instanceof AiAssistantServiceError ? e.code : "unknown";
      setFeedback({
        ok: false,
        message:
          code === "no-activity-found"
            ? 'Couldn’t find a date/time — try "Soccer practice tomorrow at 19:00"'
            : friendlyAiAssistantMessage(e),
      });
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
        Schedule activities, ask "when am I free?", or mention an exam and I'll plan study time for it.
      </Text>
      {!isAiAssistantConfigured && (
        <View style={[styles.aiNotConfiguredBanner, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.secondaryText} />
          <Text style={[styles.aiNotConfiguredText, { color: colors.secondaryText }]}>
            Free-time questions and exam planning work now — scheduling by AI needs setup by the team.
          </Text>
        </View>
      )}
      <View style={styles.aiInputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder='e.g. "Soccer practice next Tuesday at 7pm"'
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
      {feedback && (
        <View style={styles.aiFeedbackRow}>
          <Ionicons
            name={feedback.ok ? "checkmark-circle" : "alert-circle-outline"}
            size={14}
            color={feedback.ok ? colors.success : colors.secondaryText}
          />
          <Text style={[styles.aiFeedbackText, { color: feedback.ok ? colors.success : colors.secondaryText }]}>
            {feedback.message}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TodayTaskRow({ id, title, time, completed, type, colors }: { id: string; title: string; time: string; completed: boolean; type: string; colors: any }) {
  // Never trust a task's raw `time` field directly — legacy/malformed records
  // (e.g. an incomplete manual entry saved before Planner's time picker
  // enforced a valid HH:mm) must render as "Time not set" instead of
  // crashing this row and, with it, the rest of Home.
  const timeResult = formatTimeLabel(time, { taskId: id });
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
          {timeResult.label}
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
    <SwipeableTab tabIndex={0} backgroundColor={colors.background}>
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
            <AIAssistantCard colors={colors} addTask={addTask} tasks={tasks} />

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
                      <TodayTaskRow key={t.id} id={t.id} title={t.title} time={t.time} completed={t.completed} type={t.type} colors={colors} />
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
                  { icon: "help-circle-outline" as const, label: "Quiz", action: () => router.push("/quiz" as any), color: "#8B5CF6" },
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
  aiFeedbackRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  aiFeedbackText: { fontSize: 12, flex: 1 },
});
