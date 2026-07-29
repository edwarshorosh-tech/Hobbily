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
  AccessibilityInfo,
  AppState,
  LayoutAnimation,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useTime, TaskSaveResult, isPastDateTime } from "../../context/TimeContext";
import { useProfile } from "../../context/ProfileContext";
import { useProgress } from "../../context/ProgressContext";
import SwipeableTab from "../../components/SwipeableTab";
import PracticeTimerModal from "../../components/PracticeTimerModal";
import BottomSheet from "../../components/BottomSheet";
import TimeWheelPicker from "../../components/time-picker/TimeWheelPicker";
import ConfirmModal from "../../components/ConfirmModal";
import { useTourTarget, useTourScrollRoot } from "../../context/TourTargetsContext";
import { Task } from "../../types/Task";
import { RecurrenceRule } from "../../types/Recurrence";
import { addDaysISO, deviceTimeZone, isPastPlannerDate, localDateISO, parseLocalISO, startOfWeekISO } from "../../utils/dateUtils";
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
import { getOccurrencesForRange, Occurrence, OccurrenceDeleteScope, OccurrenceEditScope } from "../../services/recurrenceService";
import RepeatSettings, { RepeatPreset } from "../../components/planner/RepeatSettings";
import OccurrenceScopeSheet from "../../components/planner/OccurrenceScopeSheet";
import InlinePageDisclaimer from "../../components/disclaimers/InlinePageDisclaimer";
import AIPlanningSheet from "../../components/planner/AIPlanningSheet";
import { ParsedActivity } from "../../services/aiAssistantService";

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

/** Shifts an ISO date by whole calendar months, clamping the day-of-month to the target month's real last day (e.g. Jan 31 + 1 month -> Feb 28/29, never rolling into March) — used by Month view's sticky prev/next controls. */
function addMonthsISO(iso: string, months: number): string {
  const d = parseLocalISO(iso);
  const targetFirst = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const daysInTargetMonth = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(d.getDate(), daysInTargetMonth);
  const y = targetFirst.getFullYear();
  const m = String(targetFirst.getMonth() + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ── Repeat preset <-> weekday-set mapping ────────────────────────────────────
// Kept in one place so RepeatSettings' preset chips and a rule loaded back
// from storage always agree on what "Weekdays"/"Weekend" mean.

const WEEKDAYS_SET = [1, 2, 3, 4, 5];
const WEEKEND_SET = [6, 7];

function sameWeekdaySet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Which preset (if any) a saved rule's weekdays/type matches — "custom" for anything else. */
function presetForRule(rule: RecurrenceRule): RepeatPreset {
  if (rule.type === "daily") return "daily";
  if (sameWeekdaySet(rule.weekdays, WEEKDAYS_SET)) return "weekdays";
  if (sameWeekdaySet(rule.weekdays, WEEKEND_SET)) return "weekend";
  return "custom";
}

function weekdaysForPreset(preset: RepeatPreset, customWeekdays: number[]): number[] {
  if (preset === "weekdays") return WEEKDAYS_SET;
  if (preset === "weekend") return WEEKEND_SET;
  if (preset === "custom") return customWeekdays;
  return []; // "daily" — RecurrenceRule.type === "daily" doesn't consult weekdays at all
}

// ── Task Row ──────────────────────────────────────────────────────────────────

type TaskRowProps = {
  occurrence: Occurrence;
  colors: ReturnType<typeof useTheme>["colors"];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function TaskRow({ occurrence, colors, onToggle, onEdit, onDelete }: TaskRowProps) {
  const isHobby = occurrence.type === "hobby";
  const timeResult = formatTimeLabel(occurrence.time, { taskId: occurrence.occurrenceId });
  // Shown as a "start – end" range (e.g. "11:20 AM – 12:00 PM") rather than
  // start time + a separate duration figure. Falls back to just the start
  // label (including its "Time not set" fallback) when there's no valid
  // start to compute an end from.
  const startMinutes = timeStringToMinutes(occurrence.time);
  const endTime = startMinutes !== null
    ? minutesToNormalizedTime(Math.min(LAST_MINUTE_OF_DAY, startMinutes + occurrence.duration))
    : null;
  const timeRangeLabel = timeResult.ok && endTime ? `${timeResult.label} – ${formatTime12h(endTime)}` : timeResult.label;
  return (
    <View
      style={[
        styles.taskRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        occurrence.completed && { opacity: 0.55 },
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
          name={occurrence.completed ? "checkmark-circle" : "ellipse-outline"}
          size={26}
          color={occurrence.completed ? colors.primary : colors.tabBarInactive}
        />
      </TouchableOpacity>

      <View style={styles.taskInfo}>
        <View style={styles.taskTitleRow}>
          <Text
            style={[
              styles.taskTitle,
              { color: colors.text },
              occurrence.completed && styles.strikethrough,
            ]}
            numberOfLines={1}
          >
            {occurrence.title}
          </Text>
          {occurrence.isRecurring && (
            <Ionicons name="repeat" size={13} color={colors.secondaryText} style={{ marginLeft: 5 }} accessibilityLabel="Repeating activity" />
          )}
        </View>
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
  isPast: boolean;
  hasTasks: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
};

function DayTile({ iso, isSelected, isToday, isPast, hasTasks, colors, onPress }: DayTileProps) {
  const d = parseLocalISO(iso);
  // Short, no-bounce selection pulse — purely decorative, never blocks interaction.
  const scale = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(isSelected);

  useEffect(() => {
    if (isSelected && !wasSelected.current && !isPast) {
      scale.setValue(0.94);
      Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    }
    wasSelected.current = isSelected;
  }, [isSelected, isPast, scale]);

  const dayLabel = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const accessibilityLabel = isPast
    ? `${dayLabel}. Past date. Unavailable for planning.`
    : isSelected
    ? `${dayLabel}. Selected.`
    : `${dayLabel}. Available.`;

  return (
    <Animated.View style={[styles.dayItemWrap, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={isPast ? 1 : 0.75}
        style={[
          styles.dayItem,
          isSelected && !isPast
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          isToday && !isSelected && !isPast && { borderColor: colors.primary, borderWidth: 2 },
          isPast && styles.dayItemPast,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected && !isPast, disabled: isPast }}
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.dayName, { color: isSelected && !isPast ? "#fff" : colors.secondaryText }]} numberOfLines={1}>
          {d.toLocaleDateString(undefined, { weekday: "short" })}
        </Text>
        <Text style={[styles.dayNum, { color: isPast ? colors.secondaryText : isSelected ? "#fff" : colors.text }]}>{d.getDate()}</Text>
        <View style={styles.dayDotRow}>
          {hasTasks ? (
            <View style={[styles.dayDot, { backgroundColor: isPast ? colors.secondaryText : isSelected ? "#fff" : colors.primary }]} />
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
  /**
   * When true, dates before today are greyed out, unselectable, and tapping
   * one calls onPastDateTap instead of onSelect. Defaults to false — this
   * same DayStrip is reused inside TaskModal's own recurrence "until date"
   * picker below, where a date's validity isn't about "is it before today"
   * at all, so that call site deliberately doesn't opt in.
   */
  blockPastDates?: boolean;
  onPastDateTap?: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  taskCounts: Record<string, number>;
};

function DayStrip({ selected, onSelect, onShiftWeek, blockPastDates = false, onPastDateTap, colors, taskCounts }: DayStripProps) {
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
        <TouchableOpacity
          onPress={() => onShiftWeek(-7)}
          style={[styles.weekNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.weekLabel, { color: colors.text }]}>{weekLabel}</Text>
        <TouchableOpacity
          onPress={() => onShiftWeek(7)}
          style={[styles.weekNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Day tiles — non-scrolling 7-column grid, equal width */}
      <View style={styles.dayStripGrid}>
        {days.map((iso) => {
          const isPast = blockPastDates && isPastPlannerDate({ selectedDate: iso });
          return (
            <DayTile
              key={iso}
              iso={iso}
              isSelected={iso === selected}
              isToday={iso === today}
              isPast={isPast}
              hasTasks={(taskCounts[iso] ?? 0) > 0}
              colors={colors}
              onPress={() => (isPast ? onPastDateTap?.() : onSelect(iso))}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Week Overview (zoomed-out schedule) ──────────────────────────────────────

type WeekOverviewProps = {
  occurrences: Occurrence[];
  selected: string;
  onSelect: (iso: string) => void;
  onPastDateTap: () => void;
  /** Lifted up rather than local state — the parent screen needs to know whether Month view is open to decide whether the sticky header can ever show (see StickyMonthHeader below). */
  zoomedOut: boolean;
  onToggleZoom: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
};

function WeekOverview({ occurrences, selected, onSelect, onPastDateTap, zoomedOut, onToggleZoom, colors }: WeekOverviewProps) {
  // "Zoomed out" toggles the glance list from the current week to the whole
  // calendar month containing the selected date — same row layout, just more
  // of them; the page's own ScrollView handles the extra length.
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
          onPress={onToggleZoom}
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
        const dayTasks = occurrences
          .filter((o) => o.date === iso)
          .sort((a, b) => (timeStringToMinutes(a.time) ?? Infinity) - (timeStringToMinutes(b.time) ?? Infinity));
        const d = parseLocalISO(iso);
        const isSelected = iso === selected;
        const isToday = iso === today;
        const isPast = isPastPlannerDate({ selectedDate: iso });
        const dayLabel = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

        return (
          <TouchableOpacity
            key={iso}
            onPress={() => (isPast ? onPastDateTap() : onSelect(iso))}
            activeOpacity={isPast ? 1 : 0.7}
            style={[
              styles.weekOverviewRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              isSelected && !isPast && { backgroundColor: colors.primary + "14" },
              isPast && styles.weekOverviewRowPast,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected && !isPast, disabled: isPast }}
            accessibilityLabel={
              isPast
                ? `${dayLabel}. Past date. Unavailable for planning.`
                : isSelected
                ? `${dayLabel}. Selected.`
                : `Select ${dayLabel}`
            }
          >
            <View style={styles.weekOverviewDate}>
              <Text style={[styles.weekOverviewDay, { color: isPast ? colors.secondaryText : isToday ? colors.primary : colors.secondaryText }]}>
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </Text>
              <Text style={[styles.weekOverviewNum, { color: isPast ? colors.secondaryText : isToday ? colors.primary : colors.text }]}>
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
              <View style={[styles.weekOverviewCount, { backgroundColor: isPast ? colors.secondaryText : colors.primary }]}>
                <Text style={styles.weekOverviewCountText}>{dayTasks.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Sticky Month header ───────────────────────────────────────────────────────
// Only ever rendered while Week Overview is in Month mode AND the user has
// scrolled its card's top edge past the top of the screen — see
// TimeManagerScreen's monthSticky state. A plain fade (opacity), not a slide —
// this sits right below the fixed "My Schedule" header and must never cover
// it, so there's no vertical travel to animate.

type StickyMonthHeaderProps = {
  visible: boolean;
  monthLabel: string;
  selectedDateLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPlanPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
};

function StickyMonthHeader({ visible, monthLabel, selectedDateLabel, onPrevMonth, onNextMonth, onPlanPress, colors }: StickyMonthHeaderProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.stickyMonthHeader, { backgroundColor: colors.card, borderBottomColor: colors.border, opacity }]}
    >
      <View style={styles.stickyMonthRow}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.stickyMonthTitle, { color: colors.text }]} numberOfLines={1}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.stickyMonthRow}>
        <Text style={[styles.stickyMonthSelected, { color: colors.secondaryText }]} numberOfLines={1}>{selectedDateLabel}</Text>
        <TouchableOpacity
          onPress={onPlanPress}
          style={[styles.stickyPlanBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Plan an activity"
        >
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={styles.stickyPlanBtnText}>Plan</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Past-date toast ───────────────────────────────────────────────────────────
// A single shared instance (see TimeManagerScreen) rather than one per
// calendar tile — tapping a past date from the day strip and from Week
// Overview both funnel into the same visible/reset trigger, so rapid taps
// from either place restart the same toast instead of stacking a second one.

function PastDateToast({
  visible,
  belowStickyHeader,
  colors,
}: {
  visible: boolean;
  /** True while StickyMonthHeader is also showing — the toast drops below it instead of overlapping it. */
  belowStickyHeader: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : -6, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pastDateToast,
        belowStickyHeader && styles.pastDateToastBelowSticky,
        { backgroundColor: colors.text, opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name="information-circle" size={16} color={colors.background} />
      <Text style={[styles.pastDateToastText, { color: colors.background }]}>
        This date has already passed. Choose today or a future date.
      </Text>
    </Animated.View>
  );
}

// ── Plan an activity ─────────────────────────────────────────────────────────
// The single primary entry point for adding something — a collapsed card
// that expands into two options (manual / Bubble). Height/appear-disappear
// of the options row is handled by LayoutAnimation (core React Native, not a
// new dependency) rather than manually animating height from an unmeasured
// "auto" — LayoutAnimation smoothly animates every sibling's layout change in
// one call, which is also what keeps the surrounding ScrollView content from
// visibly jumping. The chevron rotation is a small separate Animated.Value
// since LayoutAnimation only covers layout (position/size/opacity), not
// arbitrary transforms.

type PlanActivitySelectorProps = {
  expanded: boolean;
  onToggle: () => void;
  onManual: () => void;
  onAI: () => void;
  reduceMotion: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  /** Registers the collapsed card's header as the "plannerAddActivity" tour target — see TimeManagerScreen's tourRef. */
  tourTargetRef?: (node: any) => void;
};

function PlanActivitySelector({ expanded, onToggle, onManual, onAI, reduceMotion, colors, tourTargetRef }: PlanActivitySelectorProps) {
  const chevronRotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(chevronRotate, { toValue: expanded ? 1 : 0, duration: reduceMotion ? 0 : 220, useNativeDriver: true }).start();
  }, [expanded, reduceMotion, chevronRotate]);

  return (
    <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity
        ref={tourTargetRef}
        onPress={onToggle}
        style={styles.planCardHeader}
        accessibilityRole="button"
        accessibilityLabel="Plan an activity"
        accessibilityHint={expanded ? "Collapses the planning options" : "Shows options to plan an activity"}
        accessibilityState={{ expanded }}
      >
        <View style={[styles.planCardIcon, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planCardTitle, { color: colors.text }]}>Plan an activity</Text>
          <Text style={[styles.planCardSubtitle, { color: colors.secondaryText }]}>Choose how you want to add it</Text>
        </View>
        <Animated.View
          style={{
            transform: [{ rotate: chevronRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }],
          }}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.planOptionsRow}>
          <TouchableOpacity
            onPress={onManual}
            style={[styles.planOption, { backgroundColor: colors.background, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Plan manually"
            accessibilityHint="Choose the activity, date and time yourself"
          >
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={[styles.planOptionTitle, { color: colors.text }]}>Plan manually</Text>
            <Text style={[styles.planOptionSubtitle, { color: colors.secondaryText }]}>
              Choose the activity, date and time yourself.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAI}
            style={[styles.planOption, { backgroundColor: colors.background, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Plan with Bubble"
            accessibilityHint="Describe your plan and let AI help organize it"
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text style={[styles.planOptionTitle, { color: colors.text }]}>Plan with Bubble</Text>
            <Text style={[styles.planOptionSubtitle, { color: colors.secondaryText }]}>
              Describe your plan and let AI help organize it.
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Add / Edit Task Modal ─────────────────────────────────────────────────────

/**
 * What's being edited, if anything. `occurrence`/`scope` are present only
 * when the user chose a this/following/all scope for one occurrence of a
 * recurring series (see OccurrenceScopeSheet) — a plain one-off edit only
 * ever carries `task`.
 */
export type EditingContext = {
  task: Task;
  occurrence?: Occurrence;
  scope?: OccurrenceEditScope;
};

type TaskFormResult = {
  title: string;
  type: "task" | "hobby";
  date: string;
  time: string;
  duration: number;
  repeatEnabled: boolean;
  recurrenceRule: RecurrenceRule | null;
};

type TaskModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Resolves to a conflict if the slot overlaps an existing task. The caller (not this component) decides which TimeContext function the result maps to — create, plain edit, or a scoped occurrence edit. */
  onSave: (fields: TaskFormResult) => Promise<TaskSaveResult>;
  defaultDate: string;
  colors: ReturnType<typeof useTheme>["colors"];
  hobbies: string[];
  /** Pass to open in edit mode, undefined/null for add mode. */
  editing?: EditingContext | null;
  /**
   * Pre-fills a brand-new (not yet saved) activity — e.g. from Bubble's
   * "Edit details" action (see AIPlanningSheet). Distinct from `editing`:
   * this is still a CREATE, not an update to an existing Task, so it goes
   * through the normal add path once saved. Ignored whenever `editing` is
   * also set. Shares ParsedActivity's exact shape so a Bubble reply can be
   * passed straight through with no extra mapping.
   */
  draft?: ParsedActivity | null;
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

/** Same idea as snapshotFromTask, but for a not-yet-saved AI-suggested activity (see TaskModalProps.draft) — a malformed/unparseable time still falls back sanely rather than blocking the sheet from opening at all. */
function snapshotFromDraft(draft: ParsedActivity): TaskFormSnapshot {
  const time = parseTimeString(draft.time) ?? { hour: 9, minute: 0 };
  return { title: draft.title, type: draft.type, date: draft.date, time, endTime: deriveEndTime(time, draft.duration) };
}

function TaskModal({ visible, onClose, onSave, defaultDate, colors, hobbies, editing, draft, taskCounts, onDateCommitted }: TaskModalProps) {
  const isEdit = !!editing;
  // A single occurrence's own calendar date is fixed — "this"/"following"
  // pin down which date is being split off, and "all" edits the series'
  // template without retroactively moving its start. Only a brand-new
  // activity or a plain one-off task's date is actually movable here.
  const dateEditable = !editing?.occurrence;
  // Repeat only makes sense to show for: a brand-new activity, a plain
  // one-off being edited (can still be turned into a new series), or an
  // existing occurrence edited with "following"/"all". "this" always
  // produces a one-off by definition (see recurrenceService.ts) — showing an
  // editable Repeat toggle there would just be confusing.
  const repeatSectionVisible = editing?.scope !== "this";

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
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>("daily");
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([]);
  const [endsMode, setEndsMode] = useState<"never" | "on_date">("never");
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const [untilPickerOpen, setUntilPickerOpen] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const initialSnapshot = useRef<TaskFormSnapshot | null>(null);

  const timeString = formatTimeString(time);
  // Pure, re-derived every render — never cached in state — so it can never
  // go stale or need its own reset/sync logic (see isDateTimeInPast).
  // Mirrors TimeContext's editOccurrence: for scope "all" the seeded date is
  // just wherever the user happened to open the sheet from (possibly a past
  // occurrence), not a new date being scheduled — the series keeps its
  // existing startsOn/history untouched, so there's nothing to reject as
  // "past" here either. Without this exception, editing a recurring series'
  // template from a past occurrence would show a "can't schedule in the
  // past" error and permanently disable Save, even though the save itself
  // was never going to be rejected.
  const isPastSelection = editing?.scope !== "all" && isPastDateTime(date, timeString);
  // Duration is never its own state — it's always start/end re-derived, so
  // the two wheels can never disagree with what actually gets saved.
  const duration = normalizedTimeToMinutes(endTime) - normalizedTimeToMinutes(time);
  const isEndBeforeOrEqualStart = duration <= 0;

  const customDaysError = repeatEnabled && repeatPreset === "custom" && customWeekdays.length === 0 ? "Select at least one day." : null;
  const untilDateError = repeatEnabled && endsMode === "on_date" && !untilDate ? "Choose an end date." : null;
  const previewRule: RecurrenceRule | null =
    repeatEnabled && !customDaysError
      ? {
          type: repeatPreset === "daily" ? "daily" : "weekly",
          interval: 1,
          weekdays: weekdaysForPreset(repeatPreset, customWeekdays),
          timeZone: deviceTimeZone(),
          startsOn: date,
          ends: endsMode,
          until: endsMode === "on_date" ? untilDate : null,
        }
      : null;

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

    let snapshot: TaskFormSnapshot;
    let seedRule: RecurrenceRule | null = null;

    if (editing?.occurrence) {
      const occ = editing.occurrence;
      const occTime = parseTimeString(occ.time) ?? { hour: 9, minute: 0 };
      snapshot = { title: occ.title, type: occ.type, date: occ.date, time: occTime, endTime: deriveEndTime(occTime, occ.duration) };
      if (editing.scope !== "this") seedRule = editing.task.recurrence ?? null;
    } else if (editing?.task) {
      snapshot = snapshotFromTask(editing.task);
    } else if (draft) {
      snapshot = snapshotFromDraft(draft);
    } else {
      snapshot = buildDefaultSnapshot(defaultDate);
    }

    initialSnapshot.current = snapshot;
    setTitle(snapshot.title);
    setType(snapshot.type);
    setDate(snapshot.date);
    setTime(snapshot.time);
    setEndTime(snapshot.endTime);

    if (seedRule) {
      setRepeatEnabled(true);
      setRepeatPreset(presetForRule(seedRule));
      setCustomWeekdays(presetForRule(seedRule) === "custom" ? seedRule.weekdays : []);
      setEndsMode(seedRule.ends);
      setUntilDate(seedRule.until);
    } else {
      setRepeatEnabled(false);
      setRepeatPreset("daily");
      setCustomWeekdays([]);
      setEndsMode("never");
      setUntilDate(null);
    }

    setConflict(null);
    setPastError(false);
    setSaveError(null);
    setSaving(false);
    setDiscardConfirmVisible(false);
    setDatePickerOpen(false);
    setStartPickerOpen(false);
    setEndPickerOpen(false);
    setUntilPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing?.occurrence?.occurrenceId ?? editing?.task?.id ?? null, editing?.scope]);

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

  function toggleCustomWeekday(day: number) {
    setCustomWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  async function handleSave() {
    if (saving) return;
    if (!title.trim()) {
      titleInputRef.current?.focus();
      return;
    }
    if (isPastSelection || isEndBeforeOrEqualStart) return;
    if (customDaysError || untilDateError) return;

    setSaving(true);
    setConflict(null);
    setPastError(false);
    setSaveError(null);
    // try/finally so an unexpected throw from onSave (network/Firestore
    // error, not just its normal { ok: false, reason } result) can never
    // leave `saving` stuck true and the Save button spinning forever.
    try {
      const result = await onSave({
        title: title.trim(),
        type,
        date,
        time: timeString,
        duration,
        repeatEnabled,
        recurrenceRule: previewRule,
      });
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
    } catch {
      setSaveError("Couldn't save this activity. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={requestClose}
      colors={colors}
      maxHeight="92%"
      avoidKeyboard
      overlay={
        <ConfirmModal
          asOverlay
          visible={discardConfirmVisible}
          title="Discard changes?"
          message="You have unsaved changes to this activity. Leave without saving?"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          dangerous
          onConfirm={confirmDiscard}
          onCancel={() => setDiscardConfirmVisible(false)}
        />
      }
    >
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
          {dateEditable ? (
            <>
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
            </>
          ) : (
            // A single occurrence's date is the pivot of the this/following
            // split (or, for "all", the series' unchanged start) — not
            // movable from here. Shown read-only rather than hidden outright
            // so it's still clear which day is being edited.
            <View style={[styles.modalInput, styles.dateDisplay, { backgroundColor: colors.inputBackground, borderColor: colors.border, opacity: 0.7 }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{formatLongDate(date)}</Text>
              <Ionicons name="lock-closed-outline" size={14} color={colors.secondaryText} />
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

          {repeatSectionVisible && (
            <>
              <RepeatSettings
                enabled={repeatEnabled}
                onToggleEnabled={setRepeatEnabled}
                preset={repeatPreset}
                onPresetChange={setRepeatPreset}
                customWeekdays={customWeekdays}
                onToggleCustomWeekday={toggleCustomWeekday}
                endsMode={endsMode}
                onEndsModeChange={setEndsMode}
                untilDateLabel={untilDate ? formatLongDate(untilDate) : null}
                onRequestPickUntilDate={() => setUntilPickerOpen((v) => !v)}
                previewRule={previewRule}
                startTime={time}
                colors={colors}
                disabled={saving}
                customDaysError={customDaysError}
              />
              {endsMode === "on_date" && untilPickerOpen && (
                <View style={styles.inlineDatePicker}>
                  <DayStrip
                    selected={untilDate ?? date}
                    onSelect={(iso) => { setUntilDate(iso); setUntilPickerOpen(false); }}
                    onShiftWeek={(deltaDays) => setUntilDate((d) => addDaysISO(d ?? date, deltaDays))}
                    colors={colors}
                    taskCounts={taskCounts}
                  />
                </View>
              )}
              {untilDateError && !untilPickerOpen && (
                <Text style={[styles.errorHint, { color: colors.danger }]}>{untilDateError}</Text>
              )}
            </>
          )}

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
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TimeManagerScreen() {
  const { colors } = useTheme();
  const {
    tasks, addTask, updateTask, deleteTask, toggleComplete,
    editOccurrence, deleteOccurrence, toggleOccurrenceComplete,
    showDailyBanner, dismissDailyBanner,
  } = useTime();
  const { profile } = useProfile();
  const { recordSession } = useProgress();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContext, setEditingContext] = useState<EditingContext | null>(null);
  const [scopeSheet, setScopeSheet] = useState<{ occurrence: Occurrence; mode: "edit" | "delete" } | null>(null);
  const [timerVisible, setTimerVisible] = useState(false);
  const [timerTask, setTimerTask] = useState<{ title: string; duration: number } | null>(null);
  const tourRef = useTourTarget("plannerAddActivity");
  const plannerScrollRoot = useTourScrollRoot("planner");
  const scrollViewRef = useRef<ScrollView>(null);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  // Re-checks "today" when the app returns to foreground, and periodically
  // while it stays foregrounded, so a stale past/today/future classification
  // never lingers past an actual midnight rollover just because nothing else
  // happened to re-render this screen.
  const [, forceDateTick] = useState(0);
  const lastKnownTodayRef = useRef(todayISO());
  useEffect(() => {
    function checkDateRollover() {
      const now = todayISO();
      if (now !== lastKnownTodayRef.current) {
        lastKnownTodayRef.current = now;
        forceDateTick((n) => n + 1);
      }
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkDateRollover();
    });
    const interval = setInterval(checkDateRollover, 5 * 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  // Month view + its sticky header (see StickyMonthHeader) — lifted here
  // rather than living inside WeekOverview, since the parent needs to know
  // the mode to decide whether the sticky overlay can ever show at all.
  const [zoomedOut, setZoomedOut] = useState(false);
  const [monthSticky, setMonthSticky] = useState(false);
  const weekOverviewOffsetRef = useRef<number | null>(null);

  // "Plan an activity" — collapsed by default; LayoutAnimation (not a new
  // dependency) smoothly animates the options row's height/opacity in and
  // out, and every sibling below it, so the ScrollView content never jumps.
  const [planSectionExpanded, setPlanSectionExpanded] = useState(false);
  const planSectionOffsetRef = useRef<number | null>(null);

  function setPlanSectionExpandedAnimated(next: boolean) {
    if (!reduceMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    }
    setPlanSectionExpanded(next);
  }

  function togglePlanSection() {
    setPlanSectionExpandedAnimated(!planSectionExpanded);
  }

  /** Used by the empty-state CTA and the sticky Month header's "Plan" button — both just need the section open and on screen, not a specific option pre-chosen. */
  function expandAndScrollToPlanSection() {
    setPlanSectionExpandedAnimated(true);
    const y = planSectionOffsetRef.current;
    if (y !== null) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }

  function setScrollRefs(node: ScrollView | null) {
    scrollViewRef.current = node;
    plannerScrollRoot.ref(node);
  }

  function handlePlannerScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    plannerScrollRoot.onScroll(e);
    const y = e.nativeEvent.contentOffset.y;
    const weekOverviewTop = weekOverviewOffsetRef.current;
    const shouldStick = zoomedOut && weekOverviewTop !== null && y >= weekOverviewTop;
    setMonthSticky((prev) => (prev === shouldStick ? prev : shouldStick));
  }

  /** Shifts the selected date by whole calendar months — Month view's sticky prev/next controls. Browsing a past month is allowed (viewing history); only *selecting a past day within it* is blocked, same as everywhere else. */
  function handleShiftMonth(delta: 1 | -1) {
    setSelectedDate((d) => addMonthsISO(d, delta));
  }

  // Past-date tap notice — one shared toast (see PastDateToast) for both the
  // day strip and Week Overview's rows, so rapid taps from either restart the
  // same timer instead of stacking multiple notices.
  const [pastDateToastVisible, setPastDateToastVisible] = useState(false);
  const pastDateToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notifyPastDateBlocked() {
    setPastDateToastVisible(true);
    if (pastDateToastTimerRef.current) clearTimeout(pastDateToastTimerRef.current);
    pastDateToastTimerRef.current = setTimeout(() => setPastDateToastVisible(false), 3000);
  }
  useEffect(() => {
    return () => {
      if (pastDateToastTimerRef.current) clearTimeout(pastDateToastTimerRef.current);
    };
  }, []);

  // Plan with Bubble — same TaskModal, just seeded with Bubble's suggestion
  // via `draft` (see TaskModalProps) instead of an empty/default snapshot.
  const [aiSheetVisible, setAiSheetVisible] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<ParsedActivity | null>(null);

  // A generous but bounded window around the selected date — comfortably
  // covers everything the day list, day-strip dots, and Week/Month at a
  // Glance can show at once (a calendar month never needs more than ~31
  // days either side of whichever day within it is selected). Recomputing
  // this is cheap: getOccurrencesForRange is O(range_days × series_count),
  // and it's the one and only place occurrences get expanded — nothing here
  // ever materializes or stores individual occurrence rows.
  const occurrenceRangeStart = addDaysISO(selectedDate, -35);
  const occurrenceRangeEnd = addDaysISO(selectedDate, 35);
  const occurrences = useMemo(
    () => getOccurrencesForRange({ tasks, rangeStart: occurrenceRangeStart, rangeEnd: occurrenceRangeEnd }),
    [tasks, occurrenceRangeStart, occurrenceRangeEnd]
  );

  const dayTasks = occurrences
    .filter((o) => o.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const taskCounts: Record<string, number> = {};
  occurrences.forEach((o) => { taskCounts[o.date] = (taskCounts[o.date] ?? 0) + 1; });

  const completedToday = dayTasks.filter((o) => o.completed).length;
  const totalToday = dayTasks.length;

  // Whole-day check ("has this entire day already gone by"), not the
  // finer same-day time-of-day check TaskModal's own isPastSelection
  // already does — that one still applies once the sheet is open, for
  // whatever date/time is actually configured in it.
  const isSelectedDatePast = isPastPlannerDate({ selectedDate });
  const [pastDateNoticeVisible, setPastDateNoticeVisible] = useState(false);

  // Add Activity stays visible and in the same place for a past day (the
  // user can still browse history there) — it just shows a short
  // explanation instead of opening the full add-activity sheet, rather than
  // opening a heavy form only to block Save once the user has already
  // filled it out.
  function openAdd() {
    if (isSelectedDatePast) {
      setPastDateNoticeVisible(true);
      return;
    }
    setEditingContext(null);
    setPendingDraft(null);
    setModalVisible(true);
  }

  /** "Plan manually" from the new Plan an activity section — same guarded open as the existing Add Activity buttons. */
  function openManualPlan() {
    openAdd();
  }

  function openAIPlan() {
    setAiSheetVisible(true);
  }

  /** Bubble's "Confirm and add" already saved the activity — this just jumps Planner to show where it landed, same as TaskModal's own onDateCommitted. */
  function handleAIActivityAdded(dateISO: string) {
    setSelectedDate(dateISO);
  }

  /** Bubble's "Edit details" — opens the exact same manual form, pre-filled, so the user can review/change anything before it's actually saved. */
  function handleAIEditDetails(activity: ParsedActivity) {
    setEditingContext(null);
    setPendingDraft(activity);
    setModalVisible(true);
  }

  /** Shifts the selected date itself by a full week — keeps the day strip, header, and Week at a Glance in sync (see buildWeekDays). */
  function handleShiftWeek(deltaDays: number) {
    setSelectedDate((d) => addDaysISO(d, deltaDays));
  }

  function openEditOccurrence(occurrence: Occurrence) {
    if (occurrence.isRecurring) {
      setScopeSheet({ occurrence, mode: "edit" });
    } else {
      setEditingContext({ task: occurrence.task });
      setModalVisible(true);
    }
  }

  function handleDeleteOccurrence(occurrence: Occurrence) {
    if (occurrence.isRecurring) {
      setScopeSheet({ occurrence, mode: "delete" });
    } else {
      deleteTask(occurrence.task.id);
    }
  }

  function handleScopeChosen(scope: OccurrenceEditScope | OccurrenceDeleteScope) {
    if (!scopeSheet) return;
    const { occurrence, mode } = scopeSheet;
    setScopeSheet(null);
    if (mode === "edit") {
      setEditingContext({ task: occurrence.task, occurrence, scope: scope as OccurrenceEditScope });
      setModalVisible(true);
    } else {
      deleteOccurrence(occurrence, scope as OccurrenceDeleteScope);
    }
  }

  /**
   * Maps the modal's plain field bundle onto the right TimeContext call —
   * create, a whole one-off edit, or one of the this/following/all scoped
   * occurrence edits (including the "user turned Repeat off while editing an
   * existing series" branches, which each scope defines differently rather
   * than guessing a single meaning — see the Repeat 4 spec this implements).
   */
  async function handleModalSave(fields: {
    title: string;
    type: "task" | "hobby";
    date: string;
    time: string;
    duration: number;
    repeatEnabled: boolean;
    recurrenceRule: RecurrenceRule | null;
  }): Promise<TaskSaveResult> {
    const editing = editingContext;

    if (editing?.occurrence && editing.scope) {
      const { occurrence, scope, task: base } = editing;
      if (!fields.repeatEnabled) {
        if (scope === "following") {
          // Must be one atomic call, not a separate deleteOccurrence(...)
          // followed by addTask(...): each TimeContext mutator closes over
          // the `tasks` snapshot from this render, so a second call made
          // before TimeContext re-renders would silently overwrite the
          // first one's persisted result. Passing newRule=null tells
          // applyOccurrenceEdit's "following" branch to split off a plain
          // one-off (no recurrence) in the same array transform that
          // truncates the old series.
          return editOccurrence(occurrence, "following", { title: fields.title, type: fields.type, time: fields.time, duration: fields.duration }, null);
        }
        if (scope === "all") {
          return updateTask(base.id, {
            title: fields.title, type: fields.type, time: fields.time, duration: fields.duration,
            recurrence: undefined, seriesId: undefined, exceptions: undefined, completions: undefined,
          });
        }
        // scope === "this" already always produces a one-off — falls through below.
      }
      if (scope !== "this" && fields.repeatEnabled && fields.recurrenceRule) {
        return editOccurrence(occurrence, scope, { title: fields.title, type: fields.type, time: fields.time, duration: fields.duration }, fields.recurrenceRule);
      }
      return editOccurrence(occurrence, scope, { title: fields.title, type: fields.type, time: fields.time, duration: fields.duration });
    }

    if (editing?.task) {
      // Plain one-off edit — or turning it into a brand-new series.
      return updateTask(editing.task.id, {
        title: fields.title, type: fields.type, date: fields.date, time: fields.time, duration: fields.duration,
        ...(fields.repeatEnabled && fields.recurrenceRule ? { recurrence: fields.recurrenceRule, seriesId: editing.task.id } : { recurrence: undefined, seriesId: undefined }),
      });
    }

    // Creating new.
    return addTask({
      title: fields.title, type: fields.type, date: fields.date, time: fields.time, duration: fields.duration, completed: false,
      ...(fields.repeatEnabled && fields.recurrenceRule ? { recurrence: fields.recurrenceRule } : null),
    });
  }

  async function handleToggleOccurrence(occurrence: Occurrence) {
    if (occurrence.isRecurring) {
      await toggleOccurrenceComplete(occurrence);
      if (!occurrence.completed) await recordSession(occurrence.duration);
      return;
    }
    await toggleComplete(occurrence.task.id);
    // Record a session when completing a hobby/task for the first time
    if (!occurrence.completed) {
      await recordSession(occurrence.duration);
    }
  }

  return (
    <SwipeableTab tabIndex={3} backgroundColor={colors.background} colors={colors}>
      {/* Bottom inset excluded — the Tabs navigator's own tab bar already
          reserves it (see hooks/useTabBarHeight.ts); reserving it again here
          would just add an empty gap above the tab bar. */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.disclaimerPad}>
          <InlinePageDisclaimer screenKey="/time-manager" colors={colors} />
        </View>

        {/* Header — compact, left-aligned. The subtitle always derives from
            selectedDate, so it can never contradict the visible month/week
            below (e.g. "Today · July 2026" while August is on screen). */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Schedule</Text>
          <Text style={[styles.headerSub, { color: colors.secondaryText }]}>
            {formatDate(selectedDate)} · {parseLocalISO(selectedDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
        <ScrollView
          ref={setScrollRefs}
          onScroll={handlePlannerScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
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

          {/* Day Strip — week navigation + day row come first, so the user
              picks a date before being offered ways to plan on it. */}
          <View style={styles.sectionPad}>
            <DayStrip
              selected={selectedDate}
              onSelect={setSelectedDate}
              onShiftWeek={handleShiftWeek}
              blockPastDates
              onPastDateTap={notifyPastDateBlocked}
              colors={colors}
              taskCounts={taskCounts}
            />
          </View>

          {/* Plan an activity — the single entry point for adding something,
              right after date selection and before that day's content. */}
          <View style={styles.sectionPad} onLayout={(e) => { planSectionOffsetRef.current = e.nativeEvent.layout.y; }}>
            <PlanActivitySelector
              expanded={planSectionExpanded}
              onToggle={togglePlanSection}
              onManual={openManualPlan}
              onAI={openAIPlan}
              reduceMotion={reduceMotion}
              colors={colors}
              tourTargetRef={tourRef}
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
                  {isSelectedDatePast
                    ? `No activities were scheduled for ${formatLongDate(selectedDate)}.`
                    : `Add an activity for ${formatLongDate(selectedDate)}.`}
                </Text>
                {/* No button here — Plan an activity above is the only entry
                    point for creating something, so this can't duplicate it.
                    Plain, non-tappable text, deliberately not styled like a
                    link/button. */}
                {!isSelectedDatePast && (
                  <Text style={[styles.emptyHint, { color: colors.secondaryText }]}>
                    Use the planner above to add an activity.
                  </Text>
                )}
              </View>
            ) : (
              dayTasks.map((occurrence) => (
                <TaskRow
                  key={occurrence.occurrenceId}
                  occurrence={occurrence}
                  colors={colors}
                  onToggle={() => handleToggleOccurrence(occurrence)}
                  onEdit={() => openEditOccurrence(occurrence)}
                  onDelete={() => handleDeleteOccurrence(occurrence)}
                />
              ))
            )}
          </View>

          {/* Week / Month overview */}
          <View style={styles.sectionPad} onLayout={(e) => { weekOverviewOffsetRef.current = e.nativeEvent.layout.y; }}>
            <WeekOverview
              occurrences={occurrences}
              selected={selectedDate}
              onSelect={setSelectedDate}
              onPastDateTap={notifyPastDateBlocked}
              zoomedOut={zoomedOut}
              onToggleZoom={() => setZoomedOut((v) => !v)}
              colors={colors}
            />
          </View>
        </ScrollView>

        <StickyMonthHeader
          visible={monthSticky}
          monthLabel={parseLocalISO(selectedDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          selectedDateLabel={`${formatDate(selectedDate)}${totalToday > 0 ? ` · ${totalToday} scheduled` : ""}`}
          onPrevMonth={() => handleShiftMonth(-1)}
          onNextMonth={() => handleShiftMonth(1)}
          onPlanPress={expandAndScrollToPlanSection}
          colors={colors}
        />
        <PastDateToast visible={pastDateToastVisible} belowStickyHeader={monthSticky} colors={colors} />
        </View>

        {/* Floating action row — Add Activity stays available even once the day
            already has tasks scheduled; Practice Now only makes sense once
            there's at least one task to practice. */}
        {dayTasks.length > 0 && (
          <View style={styles.floatingRow}>
            <TouchableOpacity
              onPress={openAdd}
              style={[styles.floatBtn, styles.addFloatBtn, { backgroundColor: colors.card, borderColor: colors.primary }, isSelectedDatePast && { opacity: 0.45 }]}
              accessibilityRole="button"
              accessibilityLabel={
                isSelectedDatePast
                  ? `Add activity for ${formatLongDate(selectedDate)} — this date has already passed`
                  : `Add activity for ${formatLongDate(selectedDate)}`
              }
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
          onClose={() => { setModalVisible(false); setPendingDraft(null); }}
          onSave={handleModalSave}
          defaultDate={selectedDate}
          colors={colors}
          hobbies={profile.hobbies}
          editing={editingContext}
          draft={pendingDraft}
          taskCounts={taskCounts}
          onDateCommitted={setSelectedDate}
        />

        <AIPlanningSheet
          visible={aiSheetVisible}
          onClose={() => setAiSheetVisible(false)}
          colors={colors}
          tasks={tasks}
          addTask={addTask}
          deleteTask={deleteTask}
          onActivityAdded={handleAIActivityAdded}
          onEditDetails={handleAIEditDetails}
          onPlanManually={openManualPlan}
        />

        <OccurrenceScopeSheet
          visible={!!scopeSheet}
          onClose={() => setScopeSheet(null)}
          onChoose={handleScopeChosen}
          colors={colors}
          mode={scopeSheet?.mode ?? "edit"}
        />

        <PracticeTimerModal
          visible={timerVisible}
          onClose={() => setTimerVisible(false)}
          onComplete={async (minutes) => { await recordSession(minutes); }}
          defaultTitle={timerTask?.title}
          defaultMinutes={timerTask?.duration ?? 15}
          colors={colors}
        />

        <ConfirmModal
          visible={pastDateNoticeVisible}
          title="Past date"
          message="You cannot add a new activity to a date that has already passed. You can still view your previous activities and progress."
          confirmLabel="Got it"
          hideCancel
          onConfirm={() => setPastDateNoticeVisible(false)}
          onCancel={() => setPastDateNoticeVisible(false)}
        />
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  disclaimerPad: { paddingHorizontal: 16, paddingTop: 10 },
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
  weekNavBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  weekLabel: { fontSize: 13, fontWeight: "700" },
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
  dayItemPast: { opacity: 0.5 },
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
  taskTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  taskTitle: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
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
  emptyBody: { textAlign: "center", fontSize: 13, lineHeight: 18 },
  emptyHint: { textAlign: "center", fontSize: 12, lineHeight: 16, marginTop: 10 },
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
  weekOverviewRowPast: { opacity: 0.5 },
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
  // Sticky month header — absolutely positioned within the wrapper View that
  // holds the ScrollView (see TimeManagerScreen), so `top: 0` sits directly
  // below the screen's fixed "My Schedule" header, never over it.
  stickyMonthHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stickyMonthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  stickyMonthTitle: { fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
  stickyMonthSelected: { fontSize: 13, fontWeight: "600", flex: 1 },
  stickyPlanBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, minHeight: 32 },
  stickyPlanBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  // Past-date toast
  pastDateToast: {
    position: "absolute",
    top: 8,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pastDateToastText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  // Approximate StickyMonthHeader height (two rows + padding) — good enough
  // to keep the toast from overlapping it without measuring it exactly.
  pastDateToastBelowSticky: { top: 100 },
  // Plan an activity
  planCard: { borderRadius: 20, borderWidth: 1, padding: 4 },
  planCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 44 },
  planCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planCardTitle: { fontSize: 16, fontWeight: "700" },
  planCardSubtitle: { fontSize: 13, marginTop: 1 },
  planOptionsRow: { flexDirection: "row", gap: 10, padding: 10, paddingTop: 0 },
  planOption: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6, minHeight: 44 },
  planOptionTitle: { fontSize: 14, fontWeight: "700" },
  planOptionSubtitle: { fontSize: 12, lineHeight: 16 },
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
  errorHint: { fontSize: 12, fontWeight: "600", marginTop: 4 },
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
