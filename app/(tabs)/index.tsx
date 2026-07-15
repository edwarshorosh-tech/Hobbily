/**
 * Home / Dashboard (tab 0)
 * Greeting, streak card, today's tasks, suggested opportunities, quick actions.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator, TextInput,
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
import { useState } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return `Good ${part}, ${name || "there"}!`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ── AI Assistant ──────────────────────────────────────────────────────────────

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function extractTime(text: string): { time: string; match: string } | null {
  let m = text.match(/\d{1,2}:\d{2}\s*(?:am|pm)?/i);
  if (m) {
    const parts = m[0].match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)!;
    let h = parseInt(parts[1], 10);
    const ampm = parts[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { time: `${h.toString().padStart(2, "0")}:${parts[2]}`, match: m[0] };
  }
  m = text.match(/\d{1,2}\s*(?:am|pm)\b/i);
  if (m) {
    const parts = m[0].match(/(\d{1,2})\s*(am|pm)/i)!;
    let h = parseInt(parts[1], 10);
    const ampm = parts[2].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { time: `${h.toString().padStart(2, "0")}:00`, match: m[0] };
  }
  return null;
}

function extractDate(text: string): { date: string; match: string } | null {
  const re = new RegExp(`(${MONTHS.join("|")})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?(,?\\s*(\\d{4}))?`, "i");
  const m = text.match(re);
  if (!m) return null;
  const monthIdx = MONTHS.findIndex((mo) => mo === m[1].toLowerCase());
  const day = parseInt(m[2], 10);
  const now = new Date();
  let year = m[5] ? parseInt(m[5], 10) : now.getFullYear();
  if (!m[5]) {
    const candidate = new Date(year, monthIdx, day);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < todayMidnight) year += 1;
  }
  const date = `${year}-${(monthIdx + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return { date, match: m[0] };
}

function extractTitle(text: string, dateMatch: string, timeMatch: string): string {
  let title = text;
  if (dateMatch) title = title.replace(dateMatch, "");
  if (timeMatch) title = title.replace(timeMatch, "");
  title = title
    .replace(/^\s*(i\s*(have|'ve got|need|want to)|remind me to|schedule|please\s*(add|schedule)?|add)\s*/i, "")
    .replace(/\bon\b/gi, "")
    .replace(/\bat\b/gi, "")
    .replace(/[,.]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!title) title = "New Task";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Mock AI parser: pulls a title, date and time out of a free-text scheduling request. */
function parseScheduleRequest(text: string): { title: string; date: string; time: string } | null {
  const dateResult = extractDate(text);
  const timeResult = extractTime(text);
  if (!dateResult || !timeResult) return null;
  return {
    title: extractTitle(text, dateResult.match, timeResult.match),
    date: dateResult.date,
    time: timeResult.time,
  };
}

function AIAssistantCard({ colors, addTask }: { colors: any; addTask: (task: any) => Promise<TaskSaveResult> }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setFeedback(null);

    await new Promise((resolve) => setTimeout(resolve, 600)); // mock AI processing delay

    const parsed = parseScheduleRequest(text);
    if (parsed) {
      const result = await addTask({
        title: parsed.title,
        type: "task",
        date: parsed.date,
        time: parsed.time,
        duration: 60,
        completed: false,
      });
      if (result.ok) {
        setFeedback({ ok: true, message: `Scheduled "${parsed.title}" — ${parsed.date} at ${parsed.time}` });
        setInput("");
      } else if (result.reason === "conflict") {
        setFeedback({
          ok: false,
          message: `That overlaps with "${result.conflict.title}" at ${result.conflict.time} — try a different time.`,
        });
      } else {
        setFeedback({ ok: false, message: "That's in the past — try a current or future date/time." });
      }
    } else {
      setFeedback({ ok: false, message: 'Couldn’t find a date/time — try "Soccer practice on July 17th at 19:00"' });
    }
    setLoading(false);
  }

  return (
    <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.aiHeaderRow}>
        <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        <Text style={[styles.aiTitle, { color: colors.text }]}>AI Assistant</Text>
      </View>
      <Text style={[styles.aiSubtitle, { color: colors.secondaryText }]}>
        Tell me about an activity and I'll add it to your schedule.
      </Text>
      <View style={styles.aiInputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder='e.g. "Soccer practice on July 17th at 19:00"'
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

function StreakCard({ streak, sessions, minutes, freeze, onFreeze, colors }: {
  streak: number; sessions: number; minutes: number;
  freeze: boolean; onFreeze: () => void; colors: any;
}) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return (
    <View style={[styles.streakCard, { backgroundColor: colors.primary }]}>
      <View style={styles.streakLeft}>
        <View style={styles.streakFlameRow}>
          <Ionicons name="flame" size={28} color="#FCD34D" />
          <Text style={styles.streakNum}>{streak}</Text>
        </View>
        <Text style={styles.streakLabel}>day streak</Text>
      </View>
      <View style={styles.streakDivider} />
      <View style={styles.streakStats}>
        <View style={styles.streakStat}>
          <Text style={styles.streakStatNum}>{sessions}</Text>
          <Text style={styles.streakStatLabel}>sessions</Text>
        </View>
        <View style={styles.streakStat}>
          <Text style={styles.streakStatNum}>{hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}</Text>
          <Text style={styles.streakStatLabel}>practiced</Text>
        </View>
      </View>
      {freeze && (
        <TouchableOpacity onPress={onFreeze} style={styles.freezeBtn}>
          <Ionicons name="snow-outline" size={16} color="#93C5FD" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function TodayTaskRow({ title, time, completed, type, colors }: { title: string; time: string; completed: boolean; type: string; colors: any }) {
  return (
    <View style={[styles.todayTask, { backgroundColor: colors.card, borderColor: colors.border, opacity: completed ? 0.55 : 1 }]}>
      <View style={[styles.todayTaskDot, { backgroundColor: type === "hobby" ? colors.primary : colors.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.todayTaskTitle, { color: colors.text }, completed && { textDecorationLine: "line-through" }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.todayTaskTime, { color: colors.secondaryText }]}>{formatTime(time)}</Text>
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
  const { currentStreak, totalSessions, totalMinutes, streakFreezeAvailable, useStreakFreeze } = useProgress();
  const [notifVisible, setNotifVisible] = useState(false);

  const today = todayISO();
  const todayTasks = tasks
    .filter((t) => t.date === today)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 4);

  const completedToday = todayTasks.filter((t) => t.completed).length;

  return (
    <SwipeableTab tabIndex={0} backgroundColor={colors.background}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.text }]}>{greeting(profile.username)}</Text>
            {profile.city ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color={colors.secondaryText} />
                <Text style={[styles.locationText, { color: colors.secondaryText }]}>{profile.city}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setNotifVisible(true)} style={[styles.notifBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <Image source={require("../../assets/images/Hobbily_Logo.png")} style={styles.headerLogo} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          <TipBanner
            storageKey={TIP_KEYS.feedFirstPost}
            text="Share what you've been practicing! Tap the pencil button to create your first post."
            icon="create-outline"
            colors={colors}
          />

          {/* AI Assistant */}
          <AIAssistantCard colors={colors} addTask={addTask} />

          {/* Streak card */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <StreakCard
              streak={currentStreak}
              sessions={totalSessions}
              minutes={totalMinutes}
              freeze={streakFreezeAvailable}
              onFreeze={useStreakFreeze}
              colors={colors}
            />
          </View>

          {/* Today's schedule */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Schedule</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/time-manager")}>
                <Text style={[styles.sectionLink, { color: colors.primary }]}>View all</Text>
              </TouchableOpacity>
            </View>

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
                  <TodayTaskRow key={t.id} title={t.title} time={t.time} completed={t.completed} type={t.type} colors={colors} />
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

          {/* Quick actions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
            <View style={styles.quickActions}>
              {[
                { icon: "add-circle-outline" as const, label: "Post", action: () => router.push("/create-post" as any), color: colors.primary },
                { icon: "newspaper-outline" as const, label: "Feed", action: () => router.push("/feed" as any), color: "#F59E0B" },
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

        </ScrollView>

        {/* Notification modal (placeholder) */}
        <Modal visible={notifVisible} transparent animationType="fade" onRequestClose={() => setNotifVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setNotifVisible(false)}>
            <View style={[styles.notifModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="notifications-outline" size={32} color={colors.secondaryText} style={{ marginBottom: 8 }} />
              <Text style={[{ color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 6 }]}>Push Notifications</Text>
              <Text style={[{ color: colors.secondaryText, textAlign: "center", fontSize: 14 }]}>
                Push notifications are coming in Phase 2!{"\n"}Stay tuned.
              </Text>
              <TouchableOpacity onPress={() => setNotifVisible(false)} style={[styles.notifClose, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  greeting: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  locationText: { fontSize: 12 },
  notifBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  headerLogo: { width: 36, height: 36, resizeMode: "contain" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sectionLink: { fontSize: 13, fontWeight: "600" },
  // Streak
  streakCard: { borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center" },
  streakLeft: { alignItems: "center", minWidth: 70 },
  streakFlameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  streakNum: { color: "#fff", fontSize: 36, fontWeight: "900" },
  streakLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },
  streakDivider: { width: 1, height: 50, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 16 },
  streakStats: { flex: 1, flexDirection: "row", gap: 16 },
  streakStat: { alignItems: "center" },
  streakStatNum: { color: "#fff", fontSize: 18, fontWeight: "800" },
  streakStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  freezeBtn: { padding: 6 },
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
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  aiHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiTitle: { fontSize: 15, fontWeight: "700" },
  aiSubtitle: { fontSize: 12, marginTop: 4, marginBottom: 10 },
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
  // Notification modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  notifModal: { width: 280, padding: 24, borderRadius: 20, borderWidth: 1, alignItems: "center" },
  notifClose: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
});
