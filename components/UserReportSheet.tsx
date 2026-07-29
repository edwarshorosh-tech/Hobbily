/**
 * UserReportSheet — the "Report user" flow, opened from
 * components/user-card/UserCardSheet.tsx's Safety section (the first
 * profile popup shown from a chat message author, post author, or
 * community member). Two steps in one sheet: pick a reason, then an
 * optional description + submit. A fresh BottomSheet instance, opened only
 * after UserCardSheet has started closing (see that file's openReportSheet)
 * — the same "close first, delayed open" fix used throughout this app for
 * two sheets that would otherwise stack as two simultaneous native Modals.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { ColorTokens } from "../context/ThemeContext";
import BottomSheet from "./BottomSheet";
import {
  MAX_REPORT_DESCRIPTION_LENGTH,
  PendingUserReport,
  UserReportReason,
  USER_REPORT_REASONS,
  USER_REPORT_REASON_LABELS,
} from "../types/UserReport";
import { submitUserReport } from "../services/userReportService";

type Props = {
  visible: boolean;
  pending: PendingUserReport | null;
  reporterUserId: string | null;
  reportedUsername?: string | null;
  colors: ColorTokens;
  onClose: () => void;
};

type Step = "reason" | "details" | "success";

/**
 * The success screen shown once the report has actually been persisted
 * (never before — see handleSubmit below, which only flips `step` to
 * "success" after submitUserReport resolves ok). Compact and content-driven
 * (no fixed sheet height): a soft-background checkmark badge, a two-line
 * message that deliberately never promises a ban or an investigation
 * outcome, and one full-width primary Done button. Icon/text/button fade
 * and rise in with a short stagger (a single controlled transition inside
 * the same BottomSheet — never a second modal), collapsing to a plain
 * opacity crossfade under Reduce Motion. The one success haptic fires here,
 * on mount of this state — i.e. exactly once, right after a confirmed
 * backend success — not when the sheet itself first opens.
 */
function ReportSuccessState({
  alreadyReported,
  colors,
  onDone,
  reduceMotion,
}: {
  alreadyReported: boolean;
  colors: ColorTokens;
  onDone: () => void;
  reduceMotion: boolean;
}) {
  const iconOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0.82);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(8);
  const btnOpacity = useSharedValue(0);
  const btnTranslateY = useSharedValue(10);

  useEffect(() => {
    if (reduceMotion) {
      iconOpacity.value = withTiming(1, { duration: 160 });
      textOpacity.value = withTiming(1, { duration: 160 });
      btnOpacity.value = withTiming(1, { duration: 160 });
      iconScale.value = 1;
      textTranslateY.value = 0;
      btnTranslateY.value = 0;
    } else {
      iconOpacity.value = withTiming(1, { duration: 200 });
      iconScale.value = withSpring(1, { damping: 14, stiffness: 180 });
      textOpacity.value = withDelay(50, withTiming(1, { duration: 200 }));
      textTranslateY.value = withDelay(50, withTiming(0, { duration: 200 }));
      btnOpacity.value = withDelay(90, withTiming(1, { duration: 200 }));
      btnTranslateY.value = withDelay(90, withTiming(0, { duration: 200 }));
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    // Runs once, when this state first mounts (i.e. once per confirmed
    // submission) — re-running on a reduceMotion toggle mid-animation isn't
    // a real scenario worth chasing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value, transform: [{ scale: iconScale.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value, transform: [{ translateY: textTranslateY.value }] }));
  const btnStyle = useAnimatedStyle(() => ({ opacity: btnOpacity.value, transform: [{ translateY: btnTranslateY.value }] }));

  return (
    <View style={styles.successState}>
      <Animated.View style={[styles.successIconWrap, { backgroundColor: (colors.success ?? colors.primary) + "22" }, iconStyle]}>
        <Ionicons name="checkmark" size={28} color={colors.success ?? colors.primary} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={[styles.successTitle, { color: colors.text }]}>Report submitted</Text>
        <Text style={[styles.successBody, { color: colors.secondaryText }]}>
          {alreadyReported
            ? "You've already reported this for the same reason. Thank you — our moderation team has it."
            : "Thank you. Our moderation team will review your report."}
        </Text>
      </Animated.View>
      <Animated.View style={btnStyle}>
        <TouchableOpacity
          onPress={onDone}
          style={[styles.primaryBtn, styles.successPrimaryBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function UserReportSheet({ visible, pending, reporterUserId, reportedUsername, colors, onClose }: Props) {
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyReported, setAlreadyReported] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  // Fresh form every time the sheet is actually (re)opened for a new report.
  useEffect(() => {
    if (visible) {
      setStep("reason");
      setReason(null);
      setDescription("");
      setSubmitting(false);
      setError(null);
      setAlreadyReported(false);
    }
  }, [visible]);

  function chooseReason(r: UserReportReason) {
    setReason(r);
    setStep("details");
  }

  async function handleSubmit() {
    if (!pending || !reporterUserId || !reason || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await submitUserReport(pending, reporterUserId, reason, description);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAlreadyReported("alreadyReported" in result && !!result.alreadyReported);
    setStep("success");
    AccessibilityInfo.announceForAccessibility?.("Report submitted successfully.");
  }

  const remaining = MAX_REPORT_DESCRIPTION_LENGTH - description.length;

  return (
    <BottomSheet visible={visible} onClose={submitting ? () => {} : onClose} colors={colors} maxHeight="88%" avoidKeyboard>
      {step === "success" ? (
        <ReportSuccessState alreadyReported={alreadyReported} colors={colors} onDone={onClose} reduceMotion={reduceMotion} />
      ) : step === "reason" ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Report {reportedUsername || "user"}</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>Why are you reporting this profile?</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {USER_REPORT_REASONS.map((r) => {
              const info = USER_REPORT_REASON_LABELS[r];
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => chooseReason(r)}
                  style={[styles.reasonRow, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={info.label}
                  accessibilityHint={info.description}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reasonLabel, { color: colors.text }]}>{info.label}</Text>
                    <Text style={[styles.reasonDesc, { color: colors.secondaryText }]}>{info.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        reason && (
          <>
            <TouchableOpacity onPress={() => setStep("reason")} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Change reason">
              <Ionicons name="chevron-back" size={16} color={colors.secondaryText} />
              <Text style={{ color: colors.secondaryText, fontSize: 13 }}>Change reason</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>{USER_REPORT_REASON_LABELS[reason].label}</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>Tell us what happened (optional)</Text>
            <Text style={[styles.hint, { color: colors.secondaryText }]}>
              Do not include private information. You do not need to repeat offensive words.
            </Text>
            <TextInput
              style={[styles.descriptionInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              placeholder="Add any extra context…"
              placeholderTextColor={colors.secondaryText}
              value={description}
              onChangeText={(t) => t.length <= MAX_REPORT_DESCRIPTION_LENGTH && setDescription(t)}
              multiline
              maxLength={MAX_REPORT_DESCRIPTION_LENGTH}
              accessibilityLabel="Report description"
            />
            <Text style={[styles.counter, { color: remaining < 20 ? colors.danger : colors.secondaryText }]}>{remaining} characters left</Text>

            {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={[styles.cancelBtnFlex, { borderColor: colors.border, opacity: submitting ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={[styles.primaryBtn, { backgroundColor: colors.danger, flex: 2, opacity: submitting ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Submit report"
                accessibilityState={{ disabled: submitting }}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Submit report</Text>}
              </TouchableOpacity>
            </View>
          </>
        )
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  reasonLabel: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  reasonDesc: { fontSize: 12, lineHeight: 16 },
  cancelBtn: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: "center", justifyContent: "center", marginTop: 12 },
  cancelBtnFlex: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: "center", justifyContent: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10, paddingVertical: 6 },
  descriptionInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: "top" },
  counter: { fontSize: 11, textAlign: "right", marginTop: 4 },
  errorText: { fontSize: 12, marginTop: 10, textAlign: "center" },
  primaryBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  successState: { paddingTop: 4, paddingBottom: 6, gap: 18 },
  successIconWrap: { alignSelf: "center", width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 28, marginBottom: 6 },
  successBody: { fontSize: 15, lineHeight: 21, textAlign: "center", paddingHorizontal: 6 },
  successPrimaryBtn: { width: "100%", minHeight: 52 },
});
