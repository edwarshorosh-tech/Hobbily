/**
 * Hidden Hobbies Quiz
 * 15 questions map to 4 hobby archetypes (Creator / Athlete-Adventurer /
 * Innovator-Techie / Performer-Connector). One question per screen, auto-advances
 * on selection. Ties are broken by the Q15 answer, then by a hybrid archetype name.
 */
import { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { setPendingQuizHobby } from "../services/quizBridge";

// ── Quiz data ─────────────────────────────────────────────────────────────────

type Letter = "A" | "B" | "C" | "D";

/** The six finer-grained subjects the connectivity breakdown is scored against. */
type Subject =
  | "Creative"
  | "Active & Sporty"
  | "Curious & STEM"
  | "Nature & Adventure"
  | "Social & Leadership"
  | "Performing Arts & Expression";

const SUBJECTS: Subject[] = [
  "Creative",
  "Active & Sporty",
  "Curious & STEM",
  "Nature & Adventure",
  "Social & Leadership",
  "Performing Arts & Expression",
];

type SubjectWeights = Partial<Record<Subject, number>>;

type Question = { prompt: string; options: { letter: Letter; label: string; subjects: SubjectWeights }[] };

/**
 * Every question's options are written in fixed A/B/C/D archetype order. A and C
 * map straight to their subject; B (Athlete/Adventurer) and D (Performer/Connector)
 * each cover two of the six subjects, so their per-question flavor decides which
 * one earns the point — a question like "Sports and adventures" splits evenly.
 */
function q(
  prompt: string,
  a: string,
  b: string, bSub: Subject | [Subject, Subject],
  c: string,
  d: string, dSub: Subject | [Subject, Subject]
): Question {
  const weights = (sub: Subject | [Subject, Subject]): SubjectWeights =>
    Array.isArray(sub) ? { [sub[0]]: 0.5, [sub[1]]: 0.5 } : { [sub]: 1 };

  return {
    prompt,
    options: [
      { letter: "A", label: a, subjects: { Creative: 1 } },
      { letter: "B", label: b, subjects: weights(bSub) },
      { letter: "C", label: c, subjects: { "Curious & STEM": 1 } },
      { letter: "D", label: d, subjects: weights(dSub) },
    ],
  };
}

const QUESTIONS: Question[] = [
  q("You have to stay in an empty room for one week. Only food and water are provided, but you can bring one item. What do you take?", "A sketchbook and pencils", "A basketball", "Active & Sporty", "A laptop with no internet", "A guitar", "Performing Arts & Expression"),
  q("You suddenly have an entire free Saturday with no responsibilities. What are you most excited to do?", "Create something", "Go outside and explore", "Nature & Adventure", "Learn a new skill", "Meet up with friends", "Social & Leadership"),
  q("A mysterious portal appears. Where do you hope it leads?", "A huge art studio", "A mountain adventure", "Nature & Adventure", "A futuristic science lab", "A concert stage", "Performing Arts & Expression"),
  q("Your school announces a surprise competition. Which one do you join?", "Photography Contest", "Sports Tournament", "Active & Sporty", "Robotics Challenge", "Talent Show", "Performing Arts & Expression"),
  q("Your phone disappears for the whole weekend. How do you spend your time?", "Drawing or creating", "Playing sports", "Active & Sporty", "Building or experimenting", "Hanging out with friends", "Social & Leadership"),
  q("Which compliment would make you happiest?", "“You're incredibly creative.”", "“You're so determined.”", "Active & Sporty", "“You're really smart.”", "“You inspire people.”", "Social & Leadership"),
  q("You receive $500 that you must spend on one hobby. What do you buy?", "Art supplies", "Sports equipment", "Active & Sporty", "A coding or robotics kit", "A musical instrument", "Performing Arts & Expression"),
  q("Which challenge sounds the most exciting?", "Paint a giant mural", "Complete a difficult hiking trail", "Nature & Adventure", "Build your own app or game", "Perform on stage", "Performing Arts & Expression"),
  q("If you could instantly master one skill, which would you choose?", "Drawing", "Any sport", "Active & Sporty", "Programming", "Singing or acting", "Performing Arts & Expression"),
  q("Which place would you love spending every afternoon?", "An art studio", "A sports center", "Active & Sporty", "A makerspace or science lab", "A music studio", "Performing Arts & Expression"),
  q("Your dream weekend looks like…", "Creating something amazing", "Going on an outdoor adventure", "Nature & Adventure", "Learning something fascinating", "Sharing experiences with people", "Social & Leadership"),
  q("Your friends need help with a project. What's your role?", "The creative thinker", "The energetic motivator", "Active & Sporty", "The problem solver", "The leader", "Social & Leadership"),
  q("Which type of videos could you watch for hours?", "Art and DIY", "Sports and adventures", ["Active & Sporty", "Nature & Adventure"], "Science and technology", "Music and performances", "Performing Arts & Expression"),
  q("If your school let you start any club, which would you choose?", "Art & Design Club", "Adventure & Sports Club", ["Nature & Adventure", "Active & Sporty"], "Robotics & Innovation Club", "Music & Performance Club", "Performing Arts & Expression"),
  q("One year from now, what would make you the proudest?", "I created something unique.", "I became stronger and healthier.", "Active & Sporty", "I mastered a difficult skill.", "I found a hobby I truly love.", ["Social & Leadership", "Performing Arts & Expression"]),
];

/** Fixed categorical hues (validated for CVD/contrast) — always in this order, never reassigned by score. */
const SUBJECT_COLORS: Record<Subject, { light: string; dark: string }> = {
  "Creative": { light: "#2a78d6", dark: "#3987e5" },
  "Active & Sporty": { light: "#1baf7a", dark: "#199e70" },
  "Curious & STEM": { light: "#eda100", dark: "#c98500" },
  "Nature & Adventure": { light: "#008300", dark: "#008300" },
  "Social & Leadership": { light: "#4a3aa7", dark: "#9085e9" },
  "Performing Arts & Expression": { light: "#e34948", dark: "#e66767" },
};

/** Sums each answer's subject weights (every option's weights sum to 1, so totals sum to 15). */
function computeSubjectScores(answers: Letter[]): Record<Subject, number> {
  const totals = Object.fromEntries(SUBJECTS.map((s) => [s, 0])) as Record<Subject, number>;
  answers.forEach((letter, i) => {
    const option = QUESTIONS[i].options.find((o) => o.letter === letter)!;
    (Object.entries(option.subjects) as [Subject, number][]).forEach(([subject, weight]) => {
      totals[subject] += weight;
    });
  });
  return totals;
}

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

// ── Archetypes ────────────────────────────────────────────────────────────────

type Archetype = {
  title: string;
  description: string;
  icon: string;
  color: string;
  /** Category to pre-filter on the Explore tab. */
  category: string;
};

const ARCHETYPES: Record<Letter, Archetype> = {
  A: {
    title: "The Creator",
    description: "You think in images, colors, and ideas nobody else has thought of yet. Whether it's sketching, photography, or DIY builds, you turn imagination into something real — keep making things only you could make.",
    icon: "color-palette-outline",
    color: "#F97316",
    category: "Drawing & Art",
  },
  B: {
    title: "The Athlete / Adventurer",
    description: "You're wired for movement and momentum, always chasing the next challenge, trail, or personal best. Your energy and grit are your superpower — channel them into a sport or adventure that pushes you further.",
    icon: "trophy-outline",
    color: "#22C55E",
    category: "Sports",
  },
  C: {
    title: "The Innovator / Techie",
    description: "You love figuring out how things work — and then figuring out how to make them work better. Coding, robotics, and problem-solving are your playground; every bug and puzzle is just a challenge waiting to be cracked.",
    icon: "hardware-chip-outline",
    color: "#3B82F6",
    category: "Coding",
  },
  D: {
    title: "The Performer / Connector",
    description: "You light up a room and bring people together, whether it's on a stage or in a group project. Music, drama, and leadership let you turn your voice — and your energy — into something everyone can share.",
    icon: "musical-notes-outline",
    color: "#EC4899",
    category: "Music",
  },
};

/** Blend names for a perfect two-way tie, keyed by the tied letters sorted alphabetically. */
const HYBRID_NAMES: Record<string, { title: string; description: string }> = {
  AB: { title: "The Creative Adventurer", description: "Part maker, part thrill-seeker — you want to build things and get outside doing them. Look for hobbies that combine hands-on making with movement, like outdoor photography or gear design." },
  AC: { title: "The Creative Innovator", description: "You blend imagination with logic — equally happy sketching a design or coding one. Hobbies that mix art and tech, like game design or digital art, are your sweet spot." },
  AD: { title: "The Creative Performer", description: "You want to make things and share them with an audience. Hobbies like music production, theater design, or content creation let you create and perform at once." },
  BC: { title: "The Adventurous Innovator", description: "You want to build and test things in the real world, not just on paper. Robotics competitions, engineering challenges, or outdoor tech projects fit you well." },
  BD: { title: "The Dynamic Connector", description: "You bring energy and people together, on a field or in a room. Team sports, group fitness, or leadership-driven clubs let you move and lead at the same time." },
  CD: { title: "The Innovative Performer", description: "You're sharp and expressive — happy solving a hard problem or holding a stage. Hobbies like music tech, esports commentary, or STEM leadership fit your mix." },
};

type Result = {
  hybrid: boolean;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: string;
};

const ALL_LETTERS: Letter[] = ["A", "B", "C", "D"];

/**
 * Tally A/B/C/D points 1-for-1 per answer. A single top score wins outright.
 * A perfect tie is broken by the Q15 answer if it's one of the tied categories;
 * otherwise a two-way tie gets a hybrid archetype name, and 3+-way ties fall
 * back to a generic "renaissance" result.
 */
function computeResult(answers: Letter[]): Result {
  const scores: Record<Letter, number> = { A: 0, B: 0, C: 0, D: 0 };
  answers.forEach((letter) => { scores[letter] += 1; });

  const maxScore = Math.max(...ALL_LETTERS.map((l) => scores[l]));
  const tied = ALL_LETTERS.filter((l) => scores[l] === maxScore);

  if (tied.length === 1) {
    const a = ARCHETYPES[tied[0]];
    return { hybrid: false, title: a.title, description: a.description, icon: a.icon, color: a.color, category: a.category };
  }

  const q15Answer = answers[14];
  if (tied.includes(q15Answer)) {
    const a = ARCHETYPES[q15Answer];
    return { hybrid: false, title: a.title, description: a.description, icon: a.icon, color: a.color, category: a.category };
  }

  if (tied.length === 2) {
    const key = [...tied].sort().join("");
    const hybrid = HYBRID_NAMES[key];
    const primary = ARCHETYPES[tied[0]];
    return { hybrid: true, title: hybrid.title, description: hybrid.description, icon: "shuffle-outline", color: primary.color, category: primary.category };
  }

  return {
    hybrid: true,
    title: "The Renaissance Explorer",
    description: "You've got creativity, drive, curiosity, and charisma all at once. You haven't landed on one lane yet — and that's exactly what this quiz is for. Try something from a few different worlds and see what sticks.",
    icon: "planet-outline",
    color: "#8B5CF6",
    category: ARCHETYPES[tied[0]].category,
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HiddenHobbiesQuiz() {
  const { colors } = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(Letter | null)[]>(Array(QUESTIONS.length).fill(null));
  const [showResult, setShowResult] = useState(false);
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
        crossfade(() => setShowResult(true));
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
    setShowResult(false);
  }

  if (showResult) {
    const finalAnswers = answers as Letter[];
    const result = computeResult(finalAnswers);
    const subjectScores = computeSubjectScores(finalAnswers);
    return <ResultScreen result={result} subjectScores={subjectScores} colors={colors} onRetake={retake} returnTo={returnTo} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${(index / QUESTIONS.length) * 100}%` as any }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.secondaryText }]}>{index + 1}/{QUESTIONS.length}</Text>
      </View>

      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.questionEyebrow, { color: colors.primary }]}>QUESTION {index + 1}</Text>
          <Text style={[styles.questionText, { color: colors.text }]}>{question.prompt}</Text>
        </View>

        <View style={styles.options}>
          {question.options.map((opt) => {
            const isSelected = selected === opt.letter;
            return (
              <Pressable
                key={opt.letter}
                onPress={() => selectOption(opt.letter)}
                style={({ pressed }) => [
                  styles.optionBtn,
                  {
                    backgroundColor: isSelected ? colors.primary + "18" : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.optionDot,
                    { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent" },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.optionText, { color: colors.text }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function ResultScreen({
  result, subjectScores, colors, onRetake, returnTo,
}: { result: Result; subjectScores: Record<Subject, number>; colors: any; onRetake: () => void; returnTo?: string }) {
  const { isDark } = useTheme();
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
                  const color = isDark ? SUBJECT_COLORS[subject].dark : SUBJECT_COLORS[subject].light;
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
  optionBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, gap: 12 },
  optionDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", lineHeight: 20 },

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
