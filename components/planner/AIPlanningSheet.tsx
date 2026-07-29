/**
 * AIPlanningSheet — "Plan with Bubble", one of the two options inside
 * Planner's "Plan an activity" section (see app/(tabs)/time-manager.tsx's
 * PlanActivitySelector). Talks to the exact same Worker endpoint the old
 * Home AI card used (services/aiAssistantService.ts) — no second AI
 * integration, no fake/simulated replies.
 *
 * The one rule this whole component exists to enforce: Bubble never saves an
 * activity on its own. A "add_activity" reply only ever produces a preview
 * card (Activity/Date/Time/Duration) with three explicit actions — Confirm
 * and add, Edit details, Cancel. Saving only happens from "Confirm and add",
 * through the exact same addTask() the manual form uses — no second
 * create-activity path, and the same past-date/conflict validation applies.
 *
 * Uses the core Animated API (not Reanimated) — matching the rest of this
 * session's new Planner work, and there is nothing gesture-driven here that
 * would need it.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import BottomSheet from "../BottomSheet";
import { Task } from "../../types/Task";
import { TaskSaveResult } from "../../context/TimeContext";
import { parseLocalISO } from "../../utils/dateUtils";
import { formatTimeLabel } from "../../utils/time";
import { formatDuration } from "../../utils/duration";
import {
  ChatMessage,
  ChatRole,
  ParsedActivity,
  friendlyAiAssistantMessage,
  getAiWorkerDiagnostics,
  isAiAssistantConfigured,
  sendChatMessage,
} from "../../services/aiAssistantService";

type DisplayMessage = { id: number; role: ChatRole; text: string; isError?: boolean };
type PendingPreview = { text: string; activity: ParsedActivity };

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
  tasks: Task[];
  addTask: (task: Omit<Task, "id" | "createdAt">) => Promise<TaskSaveResult>;
  deleteTask: (id: string) => Promise<void>;
  /** Fires right after a successful "Confirm and add" — the caller jumps Planner's selectedDate to show where the activity landed. */
  onActivityAdded: (dateISO: string) => void;
  /** "Edit details" — this component closes itself first (same close-then-open-delayed pattern used throughout this app for two sheets that would otherwise stack as simultaneous Modals), then hands the suggested activity to the caller, which opens the manual form pre-filled with it. */
  onEditDetails: (activity: ParsedActivity) => void;
  /** Fallback's "Plan manually" — same delayed-open handoff, but with no draft to pre-fill. */
  onPlanManually: () => void;
};

const SUGGESTIONS = ["Football tomorrow after school", "Read for 20 minutes tonight", "Practice guitar this weekend"];

/** "Thursday, August 13" — unambiguous, matches the rest of Planner's date copy. */
function formatLongDate(iso: string): string {
  return parseLocalISO(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function AIPlanningSheet({ visible, onClose, colors, tasks, addTask, deleteTask, onActivityAdded, onEditDetails, onPlanManually }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const nextId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const previewOpacity = useRef(new Animated.Value(0)).current;

  // Fresh conversation every time the sheet is actually (re)opened — see this
  // file's own header on why an in-progress dialogue isn't persisted forever.
  useEffect(() => {
    if (visible) {
      setInput("");
      setLoading(false);
      setMessages([]);
      setLastFailedText(null);
      setPendingPreview(null);
      setConfirmLoading(false);
      setConfirmError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (pendingPreview) {
      previewOpacity.setValue(0);
      Animated.timing(previewOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [pendingPreview, previewOpacity]);

  function pushMessage(role: ChatRole, text: string, isError = false) {
    nextId.current += 1;
    setMessages((prev) => [...prev, { id: nextId.current, role, text, isError }]);
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setLoading(true);
    setLastFailedText(null);

    const history: ChatMessage[] = [
      ...messages.filter((m) => !m.isError).map(({ role, text: t }) => ({ role, text: t })),
      { role: "user", text },
    ];

    try {
      const reply = await sendChatMessage(history, tasks);
      // Only committed to the visible thread — and the input cleared — once
      // we know the turn actually went through; see this file's header on
      // why a failed send must leave the typed text exactly as it was.
      pushMessage("user", text);
      setInput("");

      if (reply.kind === "message") {
        pushMessage("assistant", reply.text);
      } else if (reply.kind === "delete_task") {
        const target = tasks.find((t) => t.id === reply.taskId);
        const outcome = target ? `Removed "${target.title}" from your schedule.` : "That's already gone from your schedule.";
        if (target) await deleteTask(reply.taskId);
        pushMessage("assistant", reply.text ? `${reply.text} ${outcome}` : outcome);
      } else {
        pushMessage("assistant", reply.text || "Here's what I've got — take a look before saving:");
        setPendingPreview({ text: reply.text, activity: reply.activity });
      }
    } catch (e) {
      if (__DEV__) console.warn("[AIPlanningSheet] sendChatMessage failed", e, getAiWorkerDiagnostics());
      pushMessage("assistant", friendlyAiAssistantMessage(e), true);
      setLastFailedText(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pendingPreview || confirmLoading) return;
    setConfirmLoading(true);
    setConfirmError(null);
    const { activity } = pendingPreview;
    const result = await addTask({
      title: activity.title,
      type: activity.type,
      date: activity.date,
      time: activity.time,
      duration: activity.duration,
      completed: false,
    });
    setConfirmLoading(false);

    if (!result.ok) {
      setConfirmError(
        result.reason === "conflict"
          ? `That overlaps with "${result.conflict.title}" at ${formatTimeLabel(result.conflict.time).label} — try a different time.`
          : "That's in the past — try a current or future date/time."
      );
      return;
    }

    setPendingPreview(null);
    onActivityAdded(activity.date);
    pushMessage("assistant", `Activity added to your planner: "${activity.title}".`);
    AccessibilityInfo.announceForAccessibility?.("Activity added to your planner.");
    // A short beat to let the confirmation actually register before the
    // sheet disappears — long enough to read, short enough not to feel stuck.
    setTimeout(() => onClose(), 900);
  }

  function handleCancelPreview() {
    setPendingPreview(null);
    setConfirmError(null);
  }

  function handleEditDetails() {
    if (!pendingPreview) return;
    const activity = pendingPreview.activity;
    setPendingPreview(null);
    onClose();
    setTimeout(() => onEditDetails(activity), 200);
  }

  function handlePlanManuallyFallback() {
    onClose();
    setTimeout(() => onPlanManually(), 200);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="90%" avoidKeyboard>
      {!isAiAssistantConfigured ? (
        <View style={styles.fallbackState}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.secondaryText} />
          <Text style={[styles.fallbackText, { color: colors.secondaryText }]}>
            AI planning is not available right now. You can still plan the activity manually.
          </Text>
          <TouchableOpacity
            onPress={handlePlanManuallyFallback}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Plan manually"
          >
            <Text style={styles.primaryBtnText}>Plan manually</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Plan with Bubble</Text>
          <Text style={[styles.instruction, { color: colors.secondaryText }]}>
            Tell Bubble what you would like to do and when. Bubble will help turn it into a simple plan.
          </Text>
          <View style={[styles.noticeCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={15} color={colors.secondaryText} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>
              AI suggestions may be inaccurate. Review the date and time before saving.
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={{ paddingVertical: 4 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <View style={styles.suggestionRow}>
                {SUGGESTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setInput(s)}
                    style={[styles.suggestionChip, { backgroundColor: colors.background, borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Use suggestion: ${s}`}
                  >
                    <Text style={[styles.suggestionChipText, { color: colors.text }]} numberOfLines={2}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {messages.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
                  m.role === "user"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: m.isError ? colors.danger : colors.border },
                ]}
              >
                <Text style={{ color: m.role === "user" ? "#fff" : m.isError ? colors.danger : colors.text, fontSize: 13 }}>
                  {m.text}
                </Text>
                {m.isError && lastFailedText && (
                  <TouchableOpacity onPress={() => handleSend(lastFailedText)} accessibilityRole="button" accessibilityLabel="Retry">
                    <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {loading && (
              <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.secondaryText} />
              </View>
            )}

            {pendingPreview && (
              <Animated.View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: previewOpacity }]}>
                <Text style={[styles.previewLabel, { color: colors.secondaryText }]}>Activity</Text>
                <Text style={[styles.previewTitle, { color: colors.text }]}>{pendingPreview.activity.title}</Text>
                <View style={styles.previewRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewLabel, { color: colors.secondaryText }]}>Date</Text>
                    <Text style={[styles.previewValue, { color: colors.text }]}>{formatLongDate(pendingPreview.activity.date)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewLabel, { color: colors.secondaryText }]}>Time</Text>
                    <Text style={[styles.previewValue, { color: colors.text }]}>{formatTimeLabel(pendingPreview.activity.time).label}</Text>
                  </View>
                </View>
                <Text style={[styles.previewLabel, { color: colors.secondaryText }]}>Duration</Text>
                <Text style={[styles.previewValue, { color: colors.text }]}>{formatDuration(pendingPreview.activity.duration)}</Text>

                {confirmError && <Text style={[styles.previewError, { color: colors.danger }]}>{confirmError}</Text>}

                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={confirmLoading}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: confirmLoading ? 0.7 : 1, marginTop: 12 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm and add"
                  accessibilityState={{ disabled: confirmLoading }}
                >
                  {confirmLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm and add</Text>}
                </TouchableOpacity>
                <View style={styles.previewSecondaryRow}>
                  <TouchableOpacity
                    onPress={handleEditDetails}
                    disabled={confirmLoading}
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Edit details"
                  >
                    <Text style={{ color: colors.text, fontWeight: "600" }}>Edit details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCancelPreview}
                    disabled={confirmLoading}
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Describe what you want to plan…"
              placeholderTextColor={colors.secondaryText}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              editable={!loading}
              multiline
              accessibilityLabel="Describe what you want to plan"
            />
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={loading || !input.trim()}
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: loading || !input.trim() ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: loading || !input.trim() }}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  instruction: { fontSize: 14, lineHeight: 19, marginBottom: 10 },
  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  noticeText: { fontSize: 12, lineHeight: 16, flex: 1 },
  thread: { maxHeight: 340 },
  suggestionRow: { gap: 8, marginBottom: 8 },
  suggestionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  suggestionChipText: { fontSize: 13, fontWeight: "600" },
  bubble: { maxWidth: "88%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  bubbleUser: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleAssistant: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  retryText: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  previewCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 4, marginBottom: 8 },
  previewLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 8 },
  previewTitle: { fontSize: 17, fontWeight: "800", marginTop: 2 },
  previewValue: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  previewRow: { flexDirection: "row", gap: 12 },
  previewError: { fontSize: 12, marginTop: 10 },
  previewSecondaryRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center", minHeight: 44 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, maxHeight: 90 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fallbackState: { alignItems: "center", paddingVertical: 20, gap: 14 },
  fallbackText: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  primaryBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", width: "100%", minHeight: 48 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
