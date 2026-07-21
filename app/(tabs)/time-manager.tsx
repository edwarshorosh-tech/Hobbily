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
  TouchableOpacity,
  Animated,
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
import BottomSheet from "../../components/BottomSheet";
import TimeWheelPicker from "../../components/time-picker/TimeWheelPicker";
import ConfirmModal from "../../components/ConfirmModal";
import { Task } from "../../types/Task";
import { addDaysISO, localDateISO, parseLocalISO, startOfWeekISO } from "../../utils/dateUtils";
import {
  NormalizedTime,
  computeDefaultStart,
  formatTime12h,
  formatTimeLabel,
  formatTimeString,
  minutesToNormalizedTime,
  normalizedTimeToMinutes,
  parseTimeString,
  timeStringToMinutes,
} from "../../utils/time";
import { DEFAULT_DURATION_MINUTES, formatDuration } from "../../utils/duration";

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
  const timeResult = formatTimeLabel(task.time, { taskId: task.id });
  // Shown as a "start – end" range (e.g. "11:20 AM – 12:00 PM") rather than
  // start time + a separate duration figure. Falls back to just the start
  // label (including its "Time not set" fallback) when there's no valid
  // start to compute an end from.
  const startMinutes = timeStringToMinutes(task.time);
  const endTime = startMinutes !== null
    ? minutesToNormalizedTime(Math.min(LAST_MINUTE_OF_DAY, startMinutes + task.duration))
    : null;
  const timeRangeLabel = timeResult.ok && endTime ? `${timeResult.label} – ${formatTime12h(endTime)}` : timeResult.label;
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
          <Text style={[styles.taskTime, { color: timeResult.ok ? colors.secondaryText : colors.danger }]}>
            {timeRangeLabel}
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

/** Every YYYY-MM-DD date in the calendar month containing anchorISO, in order. */
function buildMonthDays(anchorISO: string): string[] {
  const d = parseLocalISO(anchorISO);
  const firstOfMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => addDaysISO(firstOfMonth, i));
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
  // "Zoomed out" toggles the glance list from the current week to the whole
  // calendar month containing the selected date — same row layout, just more
  // of them; the page's own ScrollView handles the extra length.
  const [zoomedOut, setZoomedOut] = useState(false);
  const days = zoomedOut ? buildMonthDays(selected) : buildWeekDays(selected);
  const today = todayISO();
  const monthLabel = parseLocalISO(selected).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <View style={[styles.weekOverviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.weekOverviewHeader}>
        <Text style={[styles.weekOverviewTitle, { color: colors.text }]}>
          {zoomedOut ? `${monthLabel} at a Glance` : "Week at a Glance"}
        </Text>
        <TouchableOpacity
          onPress={() => setZoomedOut((v) => !v)}
          style={styles.weekOverviewZoomBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={zoomedOut ? "Zoom in to week view" : "Zoom out to month view"}
        >
          <Ionicons name={zoomedOut ? "contract-outline" : "expand-outline"} size={15} color={colors.primary} />
          <Text style={[styles.weekOverviewZoomText, { color: colors.primary }]}>
            {zoomedOut ? "Week" : "Month"}
          </Text>
        </TouchableOpacity>
      </View>
      {days.map((iso, i) => {
        const dayTasks = tasks
          .filter((t) => t.date === iso)
          .sort((a, b) => (timeStringToMinutes(a.time) ?? Infinity) - (timeStringToMinutes(b.time) ?? Infinity));
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
  /** For the inline date picker's "has tasks" dots — same map the Planner's own day strip uses. */
  taskCounts: Record<string, number>;
  /** Called with the saved task's date right after a successful save, so the Planner view behind the sheet jumps to show it — the whole point of picking a different date in here is to see the task land there. */
  onDateCommitted: (iso: string) => void;
};

/** Snapshot of everything the form can change — used both to seed state on open and to detect unsaved edits (see `isDirty`). */
type TaskFormSnapshot = {
  title: string;
  type: "task" | "hobby";
  date: string;
  time: NormalizedTime;
  endTime: NormalizedTime;
};

/** End-of-day clock, one minute before midnight — a same-day activity can never extend past this. */
const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

/** Start + a duration, clamped to the same calendar day (activities never span midnight here). */
function deriveEndTime(start: NormalizedTime, durationMinutes: number): NormalizedTime {
  const endMinutes = Math.min(LAST_MINUTE_OF_DAY, normalizedTimeToMinutes(start) + durationMinutes);
  return minutesToNormalizedTime(endMinutes) ?? start;
}

/**
 * The default start date+time for a brand-new activity: "now + 1 minute",
 * computed fresh every time the sheet opens (never a stale module-load
 * value). When the Planner's currently-viewed day is today, both the date
 * and time follow that computation exactly — including rolling to tomorrow
 * if "now" is late enough that +1 minute crosses midnight. When the user has
 * already navigated the day strip to a different (future) day, that
 * explicit choice of date is preserved — only the time defaults to "now
 * clock-reading + 1 minute", since there's no sense re-deriving the date
 * from today's midnight rollover for a day the user didn't select "now" for.
 */
function buildDefaultSnapshot(defaultDate: string): TaskFormSnapshot {
  const computed = computeDefaultStart();
  const date = defaultDate === todayISO() ? computed.date : defaultDate;
  const time = parseTimeString(computed.time) ?? { hour: 9, minute: 0 };
  return { title: "", type: "task", date, time, endTime: deriveEndTime(time, DEFAULT_DURATION_MINUTES) };
}

function snapshotFromTask(task: Task): TaskFormSnapshot {
  // A legacy/malformed saved time can't be shown on the wheel picker as-is —
  // fall back to a sane default and let the user confirm/adjust it; this is
  // also how editing naturally repairs a malformed legacy record going
  // forward, since the save path can only ever write a validated time.
  const time = parseTimeString(task.time) ?? { hour: 9, minute: 0 };
  return { title: task.title, type: task.type, date: task.date, time, endTime: deriveEndTime(time, task.duration) };
}

function TaskModal({ visible, onClose, onSave, defaultDate, colors, hobbies, editingTask, taskCounts, onDateCommitted }: TaskModalProps) {
  const isEdit = !!editingTask;

  const [title, setTitle] = useState("");
  const [type, setType] = useState<"task" | "hobby">("task");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState<NormalizedTime>({ hour: 9, minute: 0 });
  const [endTime, setEndTime] = useState<NormalizedTime>({ hour: 9, minute: 30 });
  const [conflict, setConflict] = useState<Task | null>(null);
  const [pastError, setPastError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const initialSnapshot = useRef<TaskFormSnapshot | null>(null);

  const timeString = formatTimeString(time);
  // Pure, re-derived every render — never cached in state — so it can never
  // go stale or need its own reset/sync logic (see isDateTimeInPast).
  const isPastSelection = isPastDateTime(date, timeString);
  // Duration is never its own state — it's always start/end re-derived, so
  // the two wheels can never disagree with what actually gets saved.
  const duration = normalizedTimeToMinutes(endTime) - normalizedTimeToMinutes(time);
  const isEndBeforeOrEqualStart = duration <= 0;

  // isPastSelection is only ever recomputed when this component re-renders.
  // Without this, a value that was valid when the sheet opened would stay
  // "valid" on screen forever if the user leaves the sheet open and idle
  // long enough for real time to catch up to it — this tick just forces a
  // re-render every 20s while open so that can't happen; it never touches
  // form state.
  const [, forceRevalidateTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => forceRevalidateTick((n) => n + 1), 20_000);
    return () => clearInterval(interval);
  }, [visible]);

  // Recompute + seed the form exactly when the sheet becomes visible — never
  // at module load, never reusing a stale value from a previous open.
  useEffect(() => {
    if (!visible) return;
    const snapshot = editingTask ? snapshotFromTask(editingTask) : buildDefaultSnapshot(defaultDate);
    initialSnapshot.current = snapshot;
    setTitle(snapshot.title);
    setType(snapshot.type);
    setDate(snapshot.date);
    setTime(snapshot.time);
    setEndTime(snapshot.endTime);
    setConflict(null);
    setPastError(false);
    setSaveError(null);
    setSaving(false);
    setDiscardConfirmVisible(false);
    setDatePickerOpen(false);
    setStartPickerOpen(false);
    setEndPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingTask?.id]);

  const isDirty =
    !!initialSnapshot.current &&
    (title !== initialSnapshot.current.title ||
      type !== initialSnapshot.current.type ||
      date !== initialSnapshot.current.date ||
      time.hour !== initialSnapshot.current.time.hour ||
      time.minute !== initialSnapshot.current.time.minute ||
      endTime.hour !== initialSnapshot.current.endTime.hour ||
      endTime.minute !== initialSnapshot.current.endTime.minute);

  /** Every dismissal path (Cancel, close icon, backdrop, swipe, Escape, Android back) funnels through here so unsaved input is never discarded silently. */
  function requestClose() {
    if (isDirty && !saving) {
      setDiscardConfirmVisible(true);
      return;
    }
    onClose();
  }

  function confirmDiscard() {
    setDiscardConfirmVisible(false);
    onClose();
  }

  async function handleSave() {
    if (saving) return;
    if (!title.trim()) {
      titleInputRef.current?.focus();
      return;
    }
    if (isPastSelection || isEndBeforeOrEqualStart) return;

    setSaving(true);
    setConflict(null);
    setPastError(false);
    setSaveError(null);
    const result = await onSave(
      {
        title: title.trim(),
        type,
        date,
        time: timeString,
        duration,
        completed: editingTask?.completed ?? false,
      },
      editingTask?.id
    );
    setSaving(false);
    if (result.ok) {
      onDateCommitted(date);
      onClose();
    } else if (result.reason === "conflict") {
      setConflict(result.conflict);
    } else if (result.reason === "past") {
      setPastError(true);
    } else {
      setSaveError(result.message);
    }
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={requestClose} colors={colors} maxHeight="92%" avoidKeyboard>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isEdit ? "Edit Activity" : "Add to Schedule"}
            </Text>
            <TouchableOpacity onPress={requestClose} style={styles.modalCloseBtn} accessibilityRole="button" accessibilityLabel="Close">
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
            ref={titleInputRef}
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

          {/* Date — tappable, expands the same week-strip picker used on the
              Planner screen itself (not a separate calendar UI) so the two
              stay visually and behaviorally consistent. Picking a different
              day here doesn't just change what gets saved — handleSave's
              onDateCommitted call also moves the Planner day strip behind
              this sheet to that date on success, so the newly scheduled
              activity is immediately visible without a manual navigate. */}
          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Date</Text>
          <TouchableOpacity
            onPress={() => setDatePickerOpen((v) => !v)}
            disabled={saving}
            style={[styles.modalInput, styles.dateDisplay, { backgroundColor: colors.inputBackground, borderColor: datePickerOpen ? colors.primary : colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${formatLongDate(date)}. Double tap to change.`}
            accessibilityState={{ expanded: datePickerOpen }}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{formatLongDate(date)}</Text>
            <Ionicons name={datePickerOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.secondaryText} />
          </TouchableOpacity>
          {datePickerOpen && (
            <View style={styles.inlineDatePicker}>
              <DayStrip
                selected={date}
                onSelect={(iso) => { setDate(iso); setConflict(null); setPastError(false); setDatePickerOpen(false); }}
                onShiftWeek={(deltaDays) => setDate((d) => addDaysISO(d, deltaDays))}
                colors={colors}
                taskCounts={taskCounts}
              />
            </View>
          )}

          {/* Start/End time — collapsed to a tappable row by default (like Date
              above) and only mounts the wheel picker while actually expanded.
              Keeping both wheels permanently mounted (six live ScrollViews)
              was what made this sheet feel laggy; collapsed, only one wheel
              is ever animating at a time. No free-text entry either way, so
              an impossible time (12:66, 90:00, 24:00) can never be selected.
              Duration is always re-derived from the two, never its own input. */}
          <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 10 }]}>Start Time</Text>
          <TouchableOpacity
            onPress={() => setStartPickerOpen((v) => !v)}
            disabled={saving}
            style={[
              styles.modalInput,
              styles.dateDisplay,
              { backgroundColor: colors.inputBackground, borderColor: startPickerOpen ? colors.primary : (conflict || pastError || isPastSelection) ? colors.danger : colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Start time, ${formatTime12h(time)}. Double tap to change.`}
            accessibilityState={{ expanded: startPickerOpen }}
          >
            <Ionicons name="time-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{formatTime12h(time)}</Text>
            <Ionicons name={startPickerOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.secondaryText} />
          </TouchableOpacity>
          {startPickerOpen && (
            <View style={styles.inlineDatePicker}>
              <TimeWheelPicker
                value={time}
                onChange={(next) => { setTime(next); setConflict(null); setPastError(false); }}
                colors={colors}
                disabled={saving}
              />
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 14 }]}>End Time</Text>
          <TouchableOpacity
            onPress={() => setEndPickerOpen((v) => !v)}
            disabled={saving}
            style={[
              styles.modalInput,
              styles.dateDisplay,
              { backgroundColor: colors.inputBackground, borderColor: endPickerOpen ? colors.primary : (conflict || isEndBeforeOrEqualStart) ? colors.danger : colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`End time, ${formatTime12h(endTime)}. Double tap to change.`}
            accessibilityState={{ expanded: endPickerOpen }}
          >
            <Ionicons name="time-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{formatTime12h(endTime)}</Text>
            <Ionicons name={endPickerOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.secondaryText} />
          </TouchableOpacity>
          {endPickerOpen && (
            <View style={styles.inlineDatePicker}>
              <TimeWheelPicker
                value={endTime}
                onChange={(next) => { setEndTime(next); setConflict(null); }}
                colors={colors}
                disabled={saving}
              />
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: isEndBeforeOrEqualStart ? colors.danger : colors.secondaryText, marginTop: 6 }]}>
            {isEndBeforeOrEqualStart ? "End time must be after start time." : `Duration: ${formatDuration(duration)}`}
          </Text>

          {/* Past-time warning — includes a one-tap fix so recovering from an
              invalid past time never depends on precisely re-dragging the
              wheel back to a valid value; it jumps straight to "now + 1
              minute", the same computation a brand-new activity starts from. */}
          {(isPastSelection || pastError) && (
            <View style={[styles.conflictWarning, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <View style={styles.conflictWarningRow}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={[styles.conflictWarningText, { color: colors.danger }]}>
                  {date === todayISO()
                    ? "That time has already passed today. Pick a current or future time."
                    : "You can't schedule an activity in the past."}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const next = computeDefaultStart();
                  const nextTime = parseTimeString(next.time) ?? { hour: 9, minute: 0 };
                  setDate(next.date);
                  setTime(nextTime);
                  // Keep whatever duration was already dialed in rather than
                  // resetting it — only fall back to the default when the
                  // current end time wasn't even valid to begin with.
                  setEndTime(deriveEndTime(nextTime, duration > 0 ? duration : DEFAULT_DURATION_MINUTES));
                  setPastError(false);
                  setConflict(null);
                }}
                style={styles.fixTimeBtn}
                accessibilityRole="button"
                accessibilityLabel="Set to the next available time"
              >
                <Text style={[styles.fixTimeBtnText, { color: colors.danger }]}>Use next available time</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Conflict warning */}
          {conflict && !isPastSelection && (
            <View style={[styles.conflictWarning, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <View style={styles.conflictWarningRow}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={[styles.conflictWarningText, { color: colors.danger }]}>
                  {(() => {
                    const conflictTime = formatTimeLabel(conflict.time, { taskId: conflict.id });
                    return `Overlaps with "${conflict.title}" at ${conflictTime.label} (${conflict.duration} min). Pick a different time.`;
                  })()}
                </Text>
              </View>
            </View>
          )}

          {/* Generic save failure (e.g. an unexpected invalid-field result) */}
          {saveError && (
            <View style={[styles.conflictWarning, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <View style={styles.conflictWarningRow}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={[styles.conflictWarningText, { color: colors.danger }]}>{saveError}</Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={requestClose}
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }, (!title.trim() || saving || isPastSelection || isEndBeforeOrEqualStart) && { opacity: 0.4 }]}
              disabled={!title.trim() || saving || isPastSelection || isEndBeforeOrEqualStart}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? "Save changes" : "Add activity"}
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
        </ScrollView>
      </BottomSheet>

      <ConfirmModal
        visible={discardConfirmVisible}
        title="Discard changes?"
        message="You have unsaved changes to this activity. Leave without saving?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        dangerous
        onConfirm={confirmDiscard}
        onCancel={() => setDiscardConfirmVisible(false)}
      />
    </>
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
    <SwipeableTab tabIndex={1} backgroundColor={colors.background} colors={colors}>
      {/* Bottom inset excluded — the Tabs navigator's own tab bar already
          reserves it (see hooks/useTabBarHeight.ts); reserving it again here
          would just add an empty gap above the tab bar. */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
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

        {/* Floating action row — Add Activity stays available even once the day
            already has tasks scheduled; Practice Now only makes sense once
            there's at least one task to practice. */}
        {dayTasks.length > 0 && (
          <View style={styles.floatingRow}>
            <TouchableOpacity
              onPress={openAdd}
              style={[styles.floatBtn, styles.addFloatBtn, { backgroundColor: colors.card, borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={`Add activity for ${formatLongDate(selectedDate)}`}
            >
              <Ionicons name="add" size={20} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>Add Activity</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const firstHobby = dayTasks.find((t) => t.type === "hobby");
                setTimerTask({ title: firstHobby?.title ?? dayTasks[0].title, duration: firstHobby?.duration ?? dayTasks[0].duration });
                setTimerVisible(true);
              }}
              style={[styles.floatBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="play-circle" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Practice Now</Text>
            </TouchableOpacity>
          </View>
        )}

        <TaskModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSave={handleSave}
          defaultDate={selectedDate}
          colors={colors}
          hobbies={profile.hobbies}
          editingTask={editingTask}
          taskCounts={taskCounts}
          onDateCommitted={setSelectedDate}
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
  floatingRow: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 16 },
  floatBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 14 },
  addFloatBtn: { borderWidth: 1.5 },
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
  weekOverviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  weekOverviewTitle: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  weekOverviewZoomBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingLeft: 8 },
  weekOverviewZoomText: { fontSize: 13, fontWeight: "700" },
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
  dateDisplay: { flexDirection: "row", alignItems: "center" },
  inlineDatePicker: { marginTop: 10 },
  conflictWarning: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
    gap: 8,
  },
  conflictWarningRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  conflictWarningText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  fixTimeBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  fixTimeBtnText: { fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
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
