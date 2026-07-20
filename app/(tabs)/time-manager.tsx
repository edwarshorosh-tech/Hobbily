/**
 * Time Manager screen
 * Lets users schedule tasks and hobby sessions, view them by day,
 * mark them complete, edit, and toggle the daily hobby reminder.
 */
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  TouchableOpacity,
  Animated,
  PanResponder,
  TouchableWithoutFeedback,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useTime, TaskSaveResult, isPastDateTime } from "../../context/TimeContext";
import { brand } from "../../constants/colors";
import { useProfile } from "../../context/ProfileContext";
import { useProgress } from "../../context/ProgressContext";
import SwipeableTab from "../../components/SwipeableTab";
import PracticeTimerModal from "../../components/PracticeTimerModal";
import { Task } from "../../types/Task";
import { addDaysISO, localDateISO, parseLocalISO, startOfWeekISO } from "../../utils/dateUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────
// All date math below is local-calendar-day based (utils/dateUtils.ts) and
// keyed off one shared `selectedDate` — the single source of truth for the
// visible month, the visible week, the day strip's highlighted tile, the
// header subtitle, the empty-state copy, and the date passed to Add Activity.

function todayISO() {
  return localDateISO();
}

function tomorrowISO() {
  return addDaysISO(todayISO(), 1);
}

function formatDate(iso: string): string {
  const today = todayISO();
  const tomorrow = tomorrowISO();
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  const d = parseLocalISO(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Full "Thursday, August 13" form — used for the empty-state copy, which should always be unambiguous. */
function formatLongDate(iso: string): string {
  const d = parseLocalISO(iso);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatTimeInput(raw: string): string {
  const digits = (raw ?? "").replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// ── Task Row ──────────────────────────────────────────────────────────────────

type TaskRowProps = {
  task: Task;
  colors: ReturnType<typeof useTheme>["colors"];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function TaskRow({ task, colors, onToggle, onEdit, onDelete }: TaskRowProps) {
  const isHobby = task.type === "hobby";
  return (
    <View
      style={[
        styles.taskRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        task.completed && { opacity: 0.55 },
      ]}
    >
      {/* Colour accent bar */}
      <View
        style={[
          styles.taskAccent,
          { backgroundColor: isHobby ? "#fc7273" : "#cacef2" },
        ]}
      />

      <TouchableOpacity onPress={onToggle} style={styles.checkbox}>
        <Ionicons
          name={task.completed ? "checkmark-circle" : "ellipse-outline"}
          size={26}
          color={task.completed ? colors.primary : colors.tabBarInactive}
        />
      </TouchableOpacity>

      <View style={styles.taskInfo}>
        <Text
          style={[
            styles.taskTitle,
            { color: colors.text },
            task.completed && styles.strikethrough,
          ]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <View style={styles.taskMeta}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: isHobby ? "#fc727322" : colors.secondary + "40" },
            ]}
          >
            <Ionicons
              name={isHobby ? "star" : "checkbox"}
              size={10}
              color={isHobby ? colors.primary : colors.accent}
              style={{ marginRight: 3 }}
            />
            <Text
              style={[
                styles.typeBadgeText,
                { color: isHobby ? colors.primary : colors.accent },
              ]}
            >
              {isHobby ? "Hobby" : "Task"}
            </Text>
          </View>
          <Ionicons name="time-outline" size={12} color={colors.secondaryText} style={{ marginRight: 2 }} />
          <Text style={[styles.taskTime, { color: colors.secondaryText }]}>
            {formatTime(task.time)}
          </Text>
          <Text style={[styles.taskDot, { color: colors.secondaryText }]}>·</Text>
          <Text style={[styles.taskDuration, { color: colors.secondaryText }]}>
            {task.duration} min
          </Text>
        </View>
      </View>

      {/* Edit / Delete */}
      <View style={styles.taskActions}>
        <TouchableOpacity onPress={onEdit} style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={17} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Day selector strip ────────────────────────────────────────────────────────

/** The 7 local days (Mon–Sun) of the week containing `anchorISO` — the week always follows whichever date is selected. */
function buildWeekDays(anchorISO: string): string[] {
  const monday = startOfWeekISO(anchorISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

type DayTileProps = {
  iso: string;
  isSelected: boolean;
  isToday: boolean;
  hasTasks: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
};

function DayTile({ iso, isSelected, isToday, hasTasks, colors, onPress }: DayTileProps) {
  const d = parseLocalISO(iso);
  // Short, no-bounce selection pulse — purely decorative, never blocks interaction.
  const scale = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(isSelected);

  useEffect(() => {
    if (isSelected && !wasSelected.current) {
      scale.setValue(0.94);
      Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    }
    wasSelected.current = isSelected;
  }, [isSelected, scale]);

  return (
    <Animated.View style={[styles.dayItemWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          styles.dayItem,
          isSelected
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          isToday && !isSelected && { borderColor: colors.primary, borderWidth: 2 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      >
        <Text style={[styles.dayName, { color: isSelected ? "#fff" : colors.secondaryText }]} numberOfLines={1}>
          {d.toLocaleDateString(undefined, { weekday: "short" })}
        </Text>
        <Text style={[styles.dayNum, { color: isSelected ? "#fff" : colors.text }]}>{d.getDate()}</Text>
        <View style={styles.dayDotRow}>
          {hasTasks ? (
            <View style={[styles.dayDot, { backgroundColor: isSelected ? "#fff" : colors.primary }]} />
          ) : (
            <View style={styles.dayDotEmpty} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

type DayStripProps = {
  selected: string;
  onSelect: (iso: string) => void;
  onShiftWeek: (deltaDays: number) => void;
  colors: ReturnType<typeof useTheme>["colors"];
  taskCounts: Record<string, number>;
};

function DayStrip({ selected, onSelect, onShiftWeek, colors, taskCounts }: DayStripProps) {
  const days = buildWeekDays(selected);
  const today = todayISO();
  const monthLabel = parseLocalISO(days[0]).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const selectedMonday = startOfWeekISO(selected);
  const currentMonday = startOfWeekISO(today);
  const weekDelta = Math.round(
    (parseLocalISO(selectedMonday).getTime() - parseLocalISO(currentMonday).getTime()) / (24 * 60 * 60 * 1000 * 7)
  );
  const weekLabel = weekDelta === 0 ? "This Week" : weekDelta === 1 ? "Next Week" : weekDelta === -1 ? "Last Week" : monthLabel;

  return (
    <View>
      {/* Week navigation — shifts the selected date itself by 7 days, so the
          day strip, header subtitle, and Week at a Glance all stay in sync. */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => onShiftWeek(-7)} style={styles.weekNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
        <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => onShiftWeek(7)} style={styles.weekNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Day tiles — non-scrolling 7-column grid, equal width */}
      <View style={styles.dayStripGrid}>
        {days.map((iso) => (
          <DayTile
            key={iso}
            iso={iso}
            isSelected={iso === selected}
            isToday={iso === today}
            hasTasks={(taskCounts[iso] ?? 0) > 0}
            colors={colors}
            onPress={() => onSelect(iso)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Week Overview (zoomed-out schedule) ──────────────────────────────────────

type WeekOverviewProps = {
  tasks: Task[];
  selected: string;
  onSelect: (iso: string) => void;
  colors: ReturnType<typeof useTheme>["colors"];
};

function WeekOverview({ tasks, selected, onSelect, colors }: WeekOverviewProps) {
  const days = buildWeekDays(selected);
  const today = todayISO();

  return (
    <View style={[styles.weekOverviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.weekOverviewTitle, { color: colors.text }]}>Week at a Glance</Text>
      {days.map((iso, i) => {
        const dayTasks = tasks
          .filter((t) => t.date === iso)
          .sort((a, b) => a.time.localeCompare(b.time));
        const d = parseLocalISO(iso);
        const isSelected = iso === selected;
        const isToday = iso === today;

        return (
          <TouchableOpacity
            key={iso}
            onPress={() => onSelect(iso)}
            style={[
              styles.weekOverviewRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              isSelected && { backgroundColor: colors.primary + "14" },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Select ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
          >
            <View style={styles.weekOverviewDate}>
              <Text style={[styles.weekOverviewDay, { color: isToday ? colors.primary : colors.secondaryText }]}>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </Text>
              <Text style={[styles.weekOverviewNum, { color: isToday ? colors.primary : colors.text }]}>
                {d.getDate()}
              </Text>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {dayTasks.length === 0 ? (
                <Text style={[styles.weekOverviewEmpty, { color: colors.secondaryText }]}>No activities</Text>
              ) : (
                <Text numberOfLines={1} style={[styles.weekOverviewSummary, { color: colors.text }]}>
                  {dayTasks.slice(0, 2).map((t) => t.title).join(" · ")}
                  {dayTasks.length > 2 ? ` +${dayTasks.length - 2} more` : ""}
                </Text>
              )}
            </View>

            {dayTasks.length > 0 && (
              <View style={[styles.weekOverviewCount, { backgroundColor: colors.primary }]}>
                <Text style={styles.weekOverviewCountText}>{dayTasks.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Add / Edit Task Modal ─────────────────────────────────────────────────────

type TaskModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called with full field values; id is present when editing. Resolves to a conflict if the slot overlaps an existing task. */
  onSave: (fields: Omit<Task, "id" | "createdAt">, editId?: string) => Promise<TaskSaveResult>;
  defaultDate: string;
  colors: ReturnType<typeof useTheme>["colors"];
  hobbies: string[];
  /** Pass a task to open in edit mode, undefined for add mode */
  editingTask?: Task | null;
};

function TaskModal({ visible, onClose, onSave, defaultDate, colors, hobbies, editingTask }: TaskModalProps) {
  const isEdit = !!editingTask;

  const [title, setTitle] = useState(editingTask?.title ?? "");
  const [type, setType] = useState<"task" | "hobby">(editingTask?.type ?? "task");
  const [time, setTime] = useState(editingTask?.time ?? "09:00");
  const [duration, setDuration] = useState(String(editingTask?.duration ?? 30));
  const [conflict, setConflict] = useState<Task | null>(null);
  const [pastError, setPastError] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetDate = editingTask?.date ?? defaultDate;
  const isPastSelection = isPastDateTime(targetDate, time);

  // Swipe-down-to-close: track sheet position with an Animated value
  const panY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      // Activate on clear downward swipes (dy dominant over dx)
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) panY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          // Swipe past threshold — animate out then close
          Animated.timing(panY, { toValue: 500, duration: 150, useNativeDriver: true }).start(() => {
            panY.setValue(0);
            onClose();
          });
        } else {
          // Not far enough — snap back
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // Reset sheet position whenever the modal closes
  useEffect(() => { if (!visible) panY.setValue(0); }, [visible, panY]);

  // Reset fields when modal opens (handles switching between add and edit)
  function handleOpen() {
    setTitle(editingTask?.title ?? "");
    setType(editingTask?.type ?? "task");
    setTime(editingTask?.time ?? "09:00");
    setDuration(String(editingTask?.duration ?? 30));
    setConflict(null);
    setPastError(false);
    setSaving(false);
  }

  async function handleSave() {
    if (!title.trim() || saving || isPastSelection) return;
    setSaving(true);
    setConflict(null);
    setPastError(false);
    const result = await onSave(
      {
        title: title.trim(),
        type,
        date: editingTask?.date ?? defaultDate,
        time,
        duration: parseInt(duration, 10) || 30,
        completed: editingTask?.completed ?? false,
      },
      editingTask?.id
    );
    setSaving(false);
    if (result.ok) {
      onClose();
    } else if (result.reason === "conflict") {
      setConflict(result.conflict);
    } else {
      setPastError(true);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Transparent area above the sheet — tap to cancel */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[styles.modalSheet, { backgroundColor: colors.card, transform: [{ translateY: panY }] }]}
        >
          {/* Drag handle — the only draggable zone, so text inputs/buttons below
              never lose the touch to the sheet's pan responder. Padded well past
              the visible bar so it's actually easy to grab. */}
          <View
            {...panResponder.panHandlers}
            hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
            style={styles.dragHandleZone}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          </View>

          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isEdit ? "Edit Activity" : "Add to Schedule"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Type toggle — pill-style */}
          <View style={[styles.typePill, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            {(["task", "hobby"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.typePillOption,
                  type === t && { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons
                  name={t === "hobby" ? "star-outline" : "checkbox-outline"}
                  size={15}
                  color={type === t ? "#fff" : colors.secondaryText}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={{
                    color: type === t ? "#fff" : colors.secondaryText,
                    fontWeight: "700",
                    fontSize: 14,
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Title</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
            placeholder={type === "hobby" ? "e.g. Practice guitar" : "e.g. Finish homework"}
            placeholderTextColor={colors.secondaryText}
            value={title}
            onChangeText={setTitle}
            autoFocus={!isEdit}
          />

          {/* Hobby quick-fill chips */}
          {hobbies.length > 0 && type === "hobby" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Quick-fill</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {hobbies.map((h) => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => setTitle(h)}
                    style={[
                      styles.hobbyChip,
                      { backgroundColor: title === h ? colors.primary + "22" : colors.inputBackground, borderColor: title === h ? colors.primary : colors.border },
                    ]}
                  >
                    <Text style={{ color: title === h ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Time + Duration row */}
          <View style={styles.timeRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Time (HH:MM)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: (conflict || pastError || isPastSelection) ? colors.danger : colors.border }]}
                placeholder="09:00"
                placeholderTextColor={colors.secondaryText}
                value={time}
                onChangeText={(txt) => { setTime(formatTimeInput(txt)); setConflict(null); setPastError(false); }}
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                inputMode="numeric"
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Duration (min)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: conflict ? colors.danger : colors.border }]}
                placeholder="30"
                placeholderTextColor={colors.secondaryText}
                value={duration}
                onChangeText={(txt) => { setDuration(txt); setConflict(null); }}
                keyboardType="number-pad"
                inputMode="numeric"
              />
            </View>
          </View>

          {/* Duration presets */}
          <View style={styles.durationPresets}>
            {["15", "30", "45", "60", "90"].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => { setDuration(d); setConflict(null); }}
                style={[
                  styles.durationPreset,
                  {
                    backgroundColor: duration === d ? colors.primary : colors.inputBackground,
                    borderColor: duration === d ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: duration === d ? "#fff" : colors.secondaryText, fontSize: 12, fontWeight: "600" }}>
                  {d}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Past-time warning */}
          {(isPastSelection || pastError) && (
            <View style={[styles.conflictWarning, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Text style={[styles.conflictWarningText, { color: colors.danger }]}>
                {targetDate === todayISO()
                  ? "That time has already passed today. Pick a current or future time."
                  : "You can't schedule an activity in the past."}
              </Text>
            </View>
          )}

          {/* Conflict warning */}
          {conflict && !isPastSelection && (
            <View style={[styles.conflictWarning, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <Ionicons name="warning-outline" size={16} color={colors.danger} />
              <Text style={[styles.conflictWarningText, { color: colors.danger }]}>
                Overlaps with "{conflict.title}" at {formatTime(conflict.time)} ({conflict.duration} min). Pick a different time.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }, (!title.trim() || saving || isPastSelection) && { opacity: 0.4 }]}
              disabled={!title.trim() || saving || isPastSelection}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={isEdit ? "checkmark" : "add"} size={18} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{isEdit ? "Save Changes" : "Add"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TimeManagerScreen() {
  const { colors } = useTheme();
  const {
    tasks, addTask, updateTask, deleteTask, toggleComplete,
    showDailyBanner, dismissDailyBanner,
  } = useTime();
  const { profile } = useProfile();
  const { currentStreak, totalSessions, recordSession } = useProgress();

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [timerVisible, setTimerVisible] = useState(false);
  const [timerTask, setTimerTask] = useState<{ title: string; duration: number } | null>(null);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const taskCounts: Record<string, number> = {};
  tasks.forEach((t) => { taskCounts[t.date] = (taskCounts[t.date] ?? 0) + 1; });

  const completedToday = dayTasks.filter((t) => t.completed).length;
  const totalToday = dayTasks.length;

  function openAdd() {
    setEditingTask(null);
    setModalVisible(true);
  }

  /** Shifts the selected date itself by a full week — keeps the day strip, header, and Week at a Glance in sync (see buildWeekDays). */
  function handleShiftWeek(deltaDays: number) {
    setSelectedDate((d) => addDaysISO(d, deltaDays));
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setModalVisible(true);
  }

  async function handleSave(fields: Omit<Task, "id" | "createdAt">, editId?: string) {
    return editId ? updateTask(editId, fields) : addTask(fields);
  }

  async function handleToggle(task: Task) {
    await toggleComplete(task.id);
    // Record a session when completing a hobby/task for the first time
    if (!task.completed) {
      await recordSession(task.duration);
    }
  }

  return (
    <SwipeableTab tabIndex={1} backgroundColor={colors.background}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header — compact, left-aligned. The subtitle always derives from
            selectedDate, so it can never contradict the visible month/week
            below (e.g. "Today · July 2026" while August is on screen). */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Schedule</Text>
          <Text style={[styles.headerSub, { color: colors.secondaryText }]}>
            {formatDate(selectedDate)} · {parseLocalISO(selectedDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Daily Reminder Banner */}
          {showDailyBanner && (
            <View style={[styles.reminderBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}>
              <Ionicons name="alarm-outline" size={22} color={colors.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: colors.primary }]}>Daily Hobby Reminder!</Text>
                <Text style={[styles.bannerBody, { color: colors.text }]}>
                  Take 5–10 minutes today to do something you love.
                </Text>
              </View>
              <TouchableOpacity onPress={dismissDailyBanner} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>
          )}

          {/* Streak mini */}
          {currentStreak > 0 && (
            <View style={[styles.streakMini, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Ionicons name="flame" size={18} color={brand.streakFlame} />
              <Text style={[styles.streakMiniText, { color: colors.primary }]}>
                {currentStreak}-day streak · {totalSessions} sessions total
              </Text>
            </View>
          )}

          {/* Day Strip */}
          <View style={styles.sectionPad}>
            <DayStrip
              selected={selectedDate}
              onSelect={setSelectedDate}
              onShiftWeek={handleShiftWeek}
              colors={colors}
              taskCounts={taskCounts}
            />
          </View>

          {/* Progress for selected day */}
          {totalToday > 0 && (
            <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.progressTop}>
                <Text style={[styles.progressLabel, { color: colors.text }]}>
                  {formatDate(selectedDate)} — {completedToday}/{totalToday} done
                </Text>
                <Text style={[styles.progressPct, { color: colors.primary }]}>
                  {Math.round((completedToday / totalToday) * 100)}%
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: `${(completedToday / totalToday) * 100}%` as any },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Task list */}
          <View style={styles.sectionPad}>
            {dayTasks.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={30} color={colors.secondaryText} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing scheduled</Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                  Add an activity for {formatLongDate(selectedDate)}.
                </Text>
                <TouchableOpacity
                  onPress={openAdd}
                  style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add activity for ${formatLongDate(selectedDate)}`}
                >
                  <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Add Activity</Text>
                </TouchableOpacity>
              </View>
            ) : (
              dayTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  colors={colors}
                  onToggle={() => handleToggle(task)}
                  onEdit={() => openEdit(task)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))
            )}
          </View>

          {/* Week overview */}
          <View style={styles.sectionPad}>
            <WeekOverview
              tasks={tasks}
              selected={selectedDate}
              onSelect={setSelectedDate}
              colors={colors}
            />
          </View>
        </ScrollView>

        {/* Floating Practice Now button */}
        {dayTasks.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              const firstHobby = dayTasks.find((t) => t.type === "hobby");
              setTimerTask({ title: firstHobby?.title ?? dayTasks[0].title, duration: firstHobby?.duration ?? dayTasks[0].duration });
              setTimerVisible(true);
            }}
            style={[styles.practiceFloatBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="play-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Practice Now</Text>
          </TouchableOpacity>
        )}

        <TaskModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSave={handleSave}
          defaultDate={selectedDate}
          colors={colors}
          hobbies={profile.hobbies}
          editingTask={editingTask}
        />

        <PracticeTimerModal
          visible={timerVisible}
          onClose={() => setTimerVisible(false)}
          onComplete={async (minutes) => { await recordSession(minutes); }}
          defaultTitle={timerTask?.title}
          defaultMinutes={timerTask?.duration ?? 15}
          colors={colors}
        />
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  reminderBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerTitle: { fontWeight: "700", fontSize: 14, marginBottom: 2 },
  bannerBody: { fontSize: 13, lineHeight: 18 },
  sectionPad: { paddingHorizontal: 16, marginTop: 16 },
  dayStrip: { paddingBottom: 4 },
  dayStripGrid: { flexDirection: "row", gap: 4, marginTop: 8 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  weekNavBtn: { padding: 6 },
  weekLabel: { fontSize: 13, fontWeight: "700" },
  streakMini: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  streakMiniText: { fontSize: 13, fontWeight: "600" },
  practiceFloatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", margin: 16, marginTop: 8, padding: 14, borderRadius: 14 },
  dayItemWrap: { flex: 1 },
  dayItem: {
    width: "100%",
    height: 66,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayName: { fontSize: 10, fontWeight: "600", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  dayNum: { fontSize: 22, fontWeight: "800" },
  dayDotRow: { height: 8, justifyContent: "center", alignItems: "center", marginTop: 2 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  dayDotEmpty: { width: 5, height: 5 },
  progressCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  progressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: "600" },
  progressPct: { fontSize: 14, fontWeight: "700" },
  progressBar: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  taskAccent: { width: 4, alignSelf: "stretch" },
  checkbox: { marginHorizontal: 12 },
  taskInfo: { flex: 1, paddingVertical: 12 },
  taskTitle: { fontSize: 15, fontWeight: "600", marginBottom: 5 },
  strikethrough: { textDecorationLine: "line-through" },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  typeBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: "700" },
  taskTime: { fontSize: 12 },
  taskDot: { fontSize: 12 },
  taskDuration: { fontSize: 12 },
  taskActions: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  actionBtn: { padding: 8 },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  emptyBody: { textAlign: "center", fontSize: 13, lineHeight: 18, marginBottom: 14 },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  // Week overview
  weekOverviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 6,
  },
  weekOverviewTitle: { fontSize: 15, fontWeight: "700", marginHorizontal: 10, marginTop: 8, marginBottom: 6 },
  weekOverviewRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 10,
  },
  weekOverviewDate: { width: 34, alignItems: "center" },
  weekOverviewDay: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  weekOverviewNum: { fontSize: 16, fontWeight: "800" },
  weekOverviewEmpty: { fontSize: 12, fontStyle: "italic" },
  weekOverviewSummary: { fontSize: 13, fontWeight: "600" },
  weekOverviewCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  weekOverviewCountText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
  },
  dragHandleZone: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 6,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalCloseBtn: { padding: 4 },
  typePill: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  typePillOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    margin: 3,
  },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 4 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  hobbyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  timeRow: { flexDirection: "row", marginTop: 4 },
  durationPresets: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 8 },
  durationPreset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  conflictWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  conflictWarningText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
});
