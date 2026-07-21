/**
 * Hidden Hobbies Quiz
 * 15 questions map to 4 hobby archetypes (Creator / Athlete-Adventurer /
 * Innovator-Techie / Performer-Connector). One question per screen, auto-advances
 * on selection. Ties are broken by the Q15 answer, then by a hybrid archetype name.
 * Scoring logic lives in utils/quizScoring.ts (pure, unit-tested).
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from "react-native-reanimated";
import { setPendingQuizHobby } from "../services/quizBridge";
import { onboardingTheme, onboardingCardShadow } from "../constants/colors";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../context/ProfileContext";
import {
  Letter,
  Subject,
  SUBJECTS,
  QUESTIONS,
  Result,
  computeResult,
  computeSubjectScores,
} from "../utils/quizScoring";

/** Bumped only if the archetype/scoring logic in utils/quizScoring.ts changes in a way that invalidates old stored results. */
const QUIZ_VERSION = 1;

/** Fixed categorical hues (validated for CVD/contrast) — always in this order, never reassigned by score. The quiz is a fixed-light screen, so only the light variant is used. */
const SUBJECT_COLORS: Record<Subject, string> = {
  "Creative": "#2a78d6",
  "Active & Sporty": "#1baf7a",
  "Curious & STEM": "#eda100",
  "Nature & Adventure": "#008300",
  "Social & Leadership": "#4a3aa7",
  "Performing Arts & Expression": "#e34948",
};

const RING_SIZE = 64;
const RING_STROKE = 6;

/** A circular "connectivity" meter — track in a light step of the subject's hue, fill sweeping clockwise from 12 o'clock. */
function SubjectRing({ percent, color, track }: { percent: number; color: string; track: string }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} stroke={track} strokeWidth={RING_STROKE} fill="none" />
      {clamped > 0 && (
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      )}
    </Svg>
  );
}

// ── Answer option ─────────────────────────────────────────────────────────────
// Own component (not an inline .map() Pressable) so each option drives its own
// Reanimated shared values — a smooth ~180ms tint/border/radio-fill transition
// on selection change instead of an instant style swap, plus a real pressed-
// scale tactile response. overflow:"hidden" + android_ripple (rather than
// leaving Android's default press feedback unconfigured) is what actually
// fixes the "strange rectangular overlay": Android's default Pressable
// highlight ignores borderRadius unless the ripple is explicitly themed and
// the container clips it.
function QuizOption({
  label,
  selected,
  colors,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: typeof onboardingTheme;
  onPress: () => void;
}) {
  const pressScale = useSharedValue(1);
  const selectProgress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    selectProgress.value = withTiming(selected ? 1 : 0, { duration: 190 });
  }, [selected, selectProgress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    backgroundColor: interpolateColor(selectProgress.value, [0, 1], [colors.card, `${colors.primary}18`]),
    borderColor: interpolateColor(selectProgress.value, [0, 1], [colors.border, colors.primary]),
  }));
  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(selectProgress.value, [0, 1], ["transparent", colors.primary]),
    borderColor: interpolateColor(selectProgress.value, [0, 1], [colors.border, colors.primary]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: selectProgress.value,
    transform: [{ scale: 0.6 + selectProgress.value * 0.4 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { pressScale.value = withTiming(0.985, { duration: 100 }); }}
      onPressOut={() => { pressScale.value = withTiming(1, { duration: 150 }); }}
      android_ripple={{ color: `${colors.primary}22` }}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={styles.optionPressable}
    >
      <Reanimated.View style={[styles.optionBtn, onboardingCardShadow, containerStyle]}>
        <Reanimated.View style={[styles.optionDot, dotStyle]}>
          <Reanimated.View style={checkStyle}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </Reanimated.View>
        </Reanimated.View>
        <Text style={[styles.optionText, { color: colors.text }]}>{label}</Text>
      </Reanimated.View>
    </Pressable>
  );
}

// ── Completion overlay ────────────────────────────────────────────────────────
// Shown between the last answer and the result screen. Persists the result
// (if signed in) while a checkmark animates in; never advances to the result
// screen before that persistence actually succeeds, and shows Retry (keeping
// every answer already given) rather than a false success if it fails.
function CompletionOverlay({
  colors,
  error,
  onRetry,
}: {
  colors: typeof onboardingTheme;
  error: string | null;
  onRetry: () => void;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withTiming(error ? 0 : 1, { duration: 260 });
  }, [error, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.completionWrap}>
      {error ? (
        <>
          <View style={[styles.completionIcon, { backgroundColor: `${colors.danger}18`, borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          </View>
          <Text style={[styles.completionTitle, { color: colors.text }]}>Couldn&apos;t save your result</Text>
          <Text style={[styles.completionSub, { color: colors.secondaryText }]}>{error}</Text>
          <Pressable onPress={onRetry} style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 20 }]}>
            <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Reanimated.View style={[styles.completionIcon, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }, style]}>
            <Ionicons name="checkmark-circle" size={44} color={colors.primary} />
          </Reanimated.View>
          <Text style={[styles.completionTitle, { color: colors.text }]}>Quiz complete!</Text>
          <Text style={[styles.completionSub, { color: colors.secondaryText }]}>Calculating your hobby archetype…</Text>
        </>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HiddenHobbiesQuiz() {
  // Fixed light theme, like onboarding/auth — the quiz is reachable both
  // from onboarding (unauthenticated) and from inside the authenticated
  // (dark) app, but it's a self-contained light-themed mini-experience
  // either way, not meant to follow the app-wide dark mode toggle.
  const colors = onboardingTheme;
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user } = useAuth();
  const { saveQuizResult } = useProfile();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(Letter | null)[]>(Array(QUESTIONS.length).fill(null));
  const [phase, setPhase] = useState<"quiz" | "completing" | "result">("quiz");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const question = QUESTIONS[index];
  const selected = answers[index];

  function crossfade(next: () => void) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  async function attemptComplete(finalAnswers: Letter[]) {
    setPhase("completing");
    setCompletionError(null);
    const computed = computeResult(finalAnswers);
    setResult(computed);
    // Minimum visible time for the "Quiz complete" checkmark — long enough to
    // read, short enough not to feel like a blocking spinner (spec: ~600-1000ms).
    const minHold = new Promise((res) => setTimeout(res, 700));
    try {
      if (user) {
        await Promise.all([saveQuizResult({ typeId: computed.typeId, typeName: computed.title, quizVersion: QUIZ_VERSION }), minHold]);
      } else {
        await minHold;
      }
      setPhase("result");
    } catch (e) {
      if (__DEV__) console.warn("[Quiz] failed to save result", e);
      setCompletionError("Please check your connection and try again — your answers are still here.");
    }
  }

  function selectOption(letter: Letter) {
    if (transitioning) return;
    const next = [...answers];
    next[index] = letter;
    setAnswers(next);
    setTransitioning(true);

    setTimeout(() => {
      setTransitioning(false);
      if (index < QUESTIONS.length - 1) {
        crossfade(() => setIndex(index + 1));
      } else {
        crossfade(() => attemptComplete(next as Letter[]));
      }
    }, 280);
  }

  function goBack() {
    if (transitioning) return;
    if (index === 0) {
      router.back();
      return;
    }
    crossfade(() => setIndex(index - 1));
  }

  function retake() {
    setAnswers(Array(QUESTIONS.length).fill(null));
    setIndex(0);
    setPhase("quiz");
    setCompletionError(null);
    setResult(null);
  }

  if (phase === "completing") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <CompletionOverlay
          colors={colors}
          error={completionError}
          onRetry={() => attemptComplete(answers as Letter[])}
        />
      </SafeAreaView>
    );
  }

  if (phase === "result" && result) {
    const finalAnswers = answers as Letter[];
    const subjectScores = computeSubjectScores(finalAnswers);
    return <ResultScreen result={result} subjectScores={subjectScores} colors={colors} onRetake={retake} returnTo={returnTo} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }, onboardingCardShadow]}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${(index / QUESTIONS.length) * 100}%` as any }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>{index + 1}/{QUESTIONS.length}</Text>
      </View>

      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, onboardingCardShadow]}>
          <Text style={[styles.questionEyebrow, { color: colors.primary }]}>QUESTION {index + 1}</Text>
          <Text style={[styles.questionText, { color: colors.text }]}>{question.prompt}</Text>
        </View>

        <View style={styles.options}>
          {question.options.map((opt) => (
            <QuizOption
              key={opt.letter}
              label={opt.label}
              selected={selected === opt.letter}
              colors={colors}
              onPress={() => selectOption(opt.letter)}
            />
          ))}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ResultScreen({
  result, subjectScores, colors, onRetake, returnTo,
}: { result: Result; subjectScores: Record<Subject, number>; colors: any; onRetake: () => void; returnTo?: string }) {
  const fromOnboarding = returnTo === "onboarding";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.resultBadge, { backgroundColor: result.color + "22", borderColor: result.color }]}>
          <Ionicons name={result.icon as any} size={34} color={result.color} />
        </View>
        <Text style={[styles.resultEyebrow, { color: colors.secondaryText }]}>
          {result.hybrid ? "YOUR HOBBY BLEND" : "YOUR HIDDEN HOBBY ARCHETYPE"}
        </Text>
        <Text style={[styles.resultTitle, { color: colors.text }]}>{result.title}</Text>
        <Text style={[styles.resultDesc, { color: colors.secondaryText }]}>{result.description}</Text>

        <View style={styles.subjectSection}>
          <Text style={[styles.subjectSectionTitle, { color: colors.secondaryText }]}>
            HOW YOU CONNECT TO EACH SUBJECT
          </Text>
          <View style={styles.subjectGrid}>
            {[0, 1].map((row) => (
              <View key={row} style={styles.subjectRow}>
                {SUBJECTS.slice(row * 3, row * 3 + 3).map((subject) => {
                  const percent = Math.round((subjectScores[subject] / QUESTIONS.length) * 100);
                  const color = SUBJECT_COLORS[subject];
                  return (
                    <View key={subject} style={styles.subjectTile}>
                      <View style={styles.ringWrap}>
                        <SubjectRing percent={percent} color={color} track={color + "22"} />
                        <View style={styles.ringCenter} pointerEvents="none">
                          <Text style={[styles.ringPercent, { color: colors.text }]}>{percent}%</Text>
                        </View>
                      </View>
                      <Text style={[styles.subjectLabel, { color: colors.secondaryText }]} numberOfLines={2}>
                        {subject}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {fromOnboarding ? (
          <>
            <Pressable
              onPress={() => { setPendingQuizHobby(result.category); router.back(); }}
              style={[styles.primaryBtn, { backgroundColor: result.color }]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Add "{result.category}" & Continue</Text>
            </Pressable>

            <Pressable onPress={onRetake} style={[styles.secondaryBtn, { borderColor: colors.border }]}>
              <Ionicons name="refresh-outline" size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Retake Quiz</Text>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.tertiaryBtn}>
              <Text style={[styles.tertiaryBtnText, { color: colors.secondaryText }]}>Skip — I'll pick my own</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => router.push(`/(tabs)/opportunities?category=${encodeURIComponent(result.category)}` as any)}
              style={[styles.primaryBtn, { backgroundColor: result.color }]}
            >
              <Ionicons name="compass-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Explore Matching Activities</Text>
            </Pressable>

            <Pressable onPress={onRetake} style={[styles.secondaryBtn, { borderColor: colors.border }]}>
              <Ionicons name="refresh-outline" size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Retake Quiz</Text>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.tertiaryBtn}>
              <Text style={[styles.tertiaryBtnText, { color: colors.secondaryText }]}>Back to Home</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: "700", minWidth: 34, textAlign: "right" },

  body: { flex: 1, paddingHorizontal: 20, paddingTop: 28, gap: 24 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24 },
  questionEyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  questionText: { fontSize: 22, fontWeight: "800", lineHeight: 30, marginTop: 10, letterSpacing: -0.3 },

  options: { gap: 12 },
  optionPressable: { borderRadius: 16, overflow: "hidden" },
  optionBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, gap: 12 },
  optionDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", lineHeight: 20 },

  completionWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  completionIcon: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  completionTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  completionSub: { fontSize: 14, textAlign: "center", marginTop: 6 },

  resultScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 36, paddingBottom: 40 },
  resultBadge: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  resultTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", letterSpacing: -0.4, marginBottom: 8 },
  resultDesc: { fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 24 },

  // Connectivity breakdown
  subjectSection: { width: "100%", marginBottom: 28 },
  subjectSectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", marginBottom: 16 },
  subjectGrid: { width: "100%", gap: 20 },
  subjectRow: { flexDirection: "row" },
  subjectTile: { flex: 1, alignItems: "center" },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  ringPercent: { fontSize: 13, fontWeight: "800" },
  subjectLabel: { fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 8, lineHeight: 14 },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%", paddingVertical: 16, borderRadius: 16, marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%", paddingVertical: 15, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  secondaryBtnText: { fontWeight: "700", fontSize: 15 },
  tertiaryBtn: { paddingVertical: 10 },
  tertiaryBtnText: { fontSize: 13, fontWeight: "600" },
});
