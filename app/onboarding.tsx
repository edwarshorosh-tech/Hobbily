/**
 * Onboarding — shown on first launch and when not authenticated.
 * 6 steps: Welcome → Account (Firebase Auth) → Basic Info → Interests → Free Time → Feature Intro
 *
 * Step 1 creates a real Firebase Auth account (or signs in to existing one).
 * On finish: writes profile to Firestore with hasOnboarded:true, navigates to tabs.
 */
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Animated, Image, KeyboardAvoidingView, Platform, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { useState, useRef, useEffect, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useProfile } from "../context/ProfileContext";
import { useAuth } from "../context/AuthContext";
import { FreeTimePerDay } from "../types/Profile";
import { takePendingQuizHobby } from "../services/quizBridge";
import { HOBBY_OPTIONS } from "../constants/hobbies";
import { onboardingTheme, onboardingCardShadow } from "../constants/colors";

const TOTAL_STEPS = 6;

/**
 * TextInput wrapper that swaps its border to `colors.link` (and lifts with
 * the standard card shadow) while focused — the only reliable cross-platform
 * "focus ring" for a plain RN TextInput, and doubles as the web focus
 * indicator (keyboard/tab navigation) since there's no native outline here.
 */
function FocusableInput({ colors, style, onFocus, onBlur, ...rest }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...rest}
      style={[style, focused && { borderColor: colors.link ?? colors.primary, ...onboardingCardShadow }]}
      onFocus={(e: any) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e: any) => { setFocused(false); onBlur?.(e); }}
    />
  );
}

const FREE_TIME_OPTIONS: { label: string; value: FreeTimePerDay }[] = [
  { label: "< 30 min", value: "<30" },
  { label: "30 – 60 min", value: "30-60" },
  { label: "1 – 2 hours", value: "1-2h" },
  { label: "2+ hours", value: "2h+" },
];

const FEATURES = [
  { icon: "calendar-outline" as const, title: "Manage your time", body: "Schedule hobby sessions, track habits, and build daily streaks." },
  { icon: "compass-outline" as const, title: "Discover programs", body: "Find real clubs, workshops, and programs near you." },
  { icon: "chatbubbles-outline" as const, title: "Connect with peers", body: "Chat with others who share your interests in hobby channels." },
];

// ── Translate Firebase auth error codes into readable messages ────────────────

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use": return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-email": return "Please enter a valid email address.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/user-not-found": return "No account found with this email.";
    case "auth/wrong-password": return "Incorrect password. Please try again.";
    case "auth/invalid-credential": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a moment and try again.";
    default: return "Something went wrong. Please try again.";
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = onboardingTheme;
  const { saveProfile, profile } = useProfile();
  const { signUp, signIn, user } = useAuth();

  // Reactive window width (not a one-time Dimensions.get() snapshot) so the
  // slide-transition distance and hobby-tile grid stay correct across
  // rotation/split-screen/foldable resizes, sized off it.
  const { width: contentWidth } = useWindowDimensions();

  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInMode, setSignInMode] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<string[]>([]);
  const [freeTime, setFreeTime] = useState<FreeTimePerDay | "">("");

  // If user is already authenticated on mount (e.g. returning mid-onboarding),
  // skip the account-creation steps and go straight to basic info
  useEffect(() => {
    if (user && step === 0) {
      setStep(2);
    }
  }, []); // intentionally runs once on mount only

  // Returning from the Hidden Hobbies Quiz (launched from the Interests step) via
  // router.back() — pick up the suggested hobby, if any, and add it to the
  // selection. Runs on focus rather than on a param change so this screen's
  // existing instance (and its in-progress `step`/form state) is never disturbed.
  useFocusEffect(
    useCallback(() => {
      const hobby = takePendingQuizHobby();
      if (hobby) {
        setSelectedHobbies((prev) => (prev.includes(hobby) ? prev : [...prev, hobby]));
      }
    }, [])
  );

  function animateTo(nextStep: number) {
    const direction = nextStep > step ? -1 : 1;
    Animated.timing(slideAnim, { toValue: direction * contentWidth * 0.3, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(-direction * contentWidth * 0.3);
      Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    });
  }

  function goNext() { if (step < TOTAL_STEPS - 1) animateTo(step + 1); }
  function goBack() { if (step > 0) animateTo(step - 1); }

  function toggleHobby(label: string) {
    setSelectedHobbies((prev) =>
      prev.includes(label) ? prev.filter((h) => h !== label) : [...prev, label]
    );
  }

  // Step 1: Create or sign in to Firebase account
  async function handleAccountContinue() {
    setAuthError("");
    setAuthLoading(true);
    try {
      if (signInMode) {
        await signIn(email.trim(), password);
        // Signed in — if already onboarded, _layout.tsx will redirect to tabs
        // Otherwise continue onboarding from step 2
        animateTo(2);
      } else {
        await signUp(email.trim(), password);
        goNext();
      }
    } catch (err: any) {
      setAuthError(friendlyAuthError(err.code ?? ""));
    } finally {
      setAuthLoading(false);
    }
  }

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

  /** Persists onboarding completion to Firestore and only navigates once that succeeds — a failed save leaves the user on this screen with a retryable error instead of dropping them into a half-onboarded app. Guarded against double-tap via `finishing`. */
  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setFinishError("");
    try {
      await saveProfile({
        ...profile,
        username: username.trim() || "explorer",
        email: email.trim(),
        age,
        city: city.trim(),
        preferredCity: city.trim() || "London",
        hobbies: selectedHobbies,
        freeTimePerDay: (freeTime as FreeTimePerDay) || "30-60",
        hasOnboarded: true,
      });
      // router.replace (not push) — Back from the main app can never land
      // here, since onboarding never enters the navigation history.
      router.replace("/(tabs)/" as any);
    } catch (err) {
      if (__DEV__) console.warn("[Onboarding] finish failed", err);
      setFinishError("Couldn't finish setting up your account. Please check your connection and try again.");
      setFinishing(false);
    }
  }

  // ── Step canContinue rules ────────────────────────────────────────────────

  const emailValid = email.trim().includes("@") && email.trim().includes(".");
  const passwordValid = password.length >= 6;
  const ageNum = parseInt(age, 10);
  const ageValid = age === "" || (!isNaN(ageNum) && ageNum >= 13 && ageNum <= 18);
  const ageError = age !== "" && !ageValid ? "Age must be between 13 and 18." : "";

  const canContinue: boolean[] = [
    true,                                        // 0: welcome
    emailValid && passwordValid,                 // 1: account
    username.trim().length >= 2 && ageValid,     // 2: basic info
    selectedHobbies.length >= 1,                 // 3: interests
    freeTime !== "",                             // 4: free time
    true,                                        // 5: feature intro
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress dots */}
      {step > 0 && (
        <View style={styles.progressRow}>
          <TouchableOpacity
            onPress={goBack}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }, onboardingCardShadow]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i <= step ? colors.primary : colors.border },
                  i === step && styles.dotActive,
                ]}
              />
            ))}
          </View>
          <View style={{ width: 38 }} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[styles.stepWrap, { transform: [{ translateX: slideAnim }] }]}>
          {step === 0 && (
            <StepWelcome
              colors={colors}
              onStart={goNext}
              onLogin={() => { setSignInMode(true); animateTo(1); }}
            />
          )}
          {step === 1 && (
            <StepAccount
              colors={colors}
              email={email} setEmail={setEmail}
              password={password} setPassword={setPassword}
              signInMode={signInMode} setSignInMode={setSignInMode}
              authError={authError} setAuthError={setAuthError}
              authLoading={authLoading}
              canNext={canContinue[1]}
              onNext={handleAccountContinue}
            />
          )}
          {step === 2 && (
            <StepBasicInfo
              colors={colors}
              username={username} setUsername={setUsername}
              age={age} setAge={setAge}
              city={city} setCity={setCity}
              ageError={ageError}
              canNext={canContinue[2]} onNext={goNext}
            />
          )}
          {step === 3 && (
            <StepInterests
              colors={colors}
              contentWidth={contentWidth}
              selected={selectedHobbies}
              onToggle={toggleHobby}
              canNext={canContinue[3]}
              onNext={goNext}
            />
          )}
          {step === 4 && (
            <StepFreeTime
              colors={colors}
              value={freeTime}
              onSelect={setFreeTime}
              canNext={canContinue[4]}
              onNext={goNext}
            />
          )}
          {step === 5 && <StepFeatures colors={colors} onFinish={finish} finishing={finishing} finishError={finishError} />}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────

function StepWelcome({ colors, onStart, onLogin }: { colors: any; onStart: () => void; onLogin: () => void }) {
  return (
    <View style={styles.stepContent}>
      <Image source={require("../assets/images/Hobbily_Logo.png")} style={styles.welcomeLogo} />
      <Text style={[styles.welcomeTitle, { color: colors.text }]}>Hobbily</Text>
      <Text style={[styles.welcomeTagline, { color: colors.secondaryText }]}>
        Discover hobbies.{"\n"}Build habits. Connect with peers.
      </Text>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={onStart}>
        <Text style={styles.primaryBtnText}>Get Started</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onLogin} style={styles.secondaryBtn}>
        <Text style={[styles.secondaryBtnText, { color: colors.link ?? colors.primary }]}>
          Already have an account? Sign in
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Step 1: Account ───────────────────────────────────────────────────────────

function StepAccount({
  colors, email, setEmail, password, setPassword,
  signInMode, setSignInMode, authError, setAuthError,
  authLoading, canNext, onNext,
}: any) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {signInMode ? "Welcome back" : "Create your account"}
      </Text>
      <Text style={[styles.stepSub, { color: colors.secondaryText }]}>
        {signInMode
          ? "Sign in to continue where you left off."
          : "Your data syncs to the cloud — access it from any device."}
      </Text>

      {/* Toggle sign-in / sign-up */}
      <View style={[styles.toggleModeRow, { backgroundColor: colors.card, borderColor: colors.border }, onboardingCardShadow]}>
        <TouchableOpacity
          style={[styles.toggleModeBtn, !signInMode && { backgroundColor: colors.primary }]}
          onPress={() => { setSignInMode(false); setAuthError(""); }}
        >
          <Text style={[styles.toggleModeTxt, { color: !signInMode ? "#fff" : colors.secondaryText }]}>
            Create account
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleModeBtn, signInMode && { backgroundColor: colors.primary }]}
          onPress={() => { setSignInMode(true); setAuthError(""); }}
        >
          <Text style={[styles.toggleModeTxt, { color: signInMode ? "#fff" : colors.secondaryText }]}>
            Sign in
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Email *</Text>
      <FocusableInput
        colors={colors}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="you@example.com"
        placeholderTextColor={colors.secondaryText}
        value={email}
        onChangeText={(v: string) => { setEmail(v); setAuthError(""); }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Password *</Text>
      <FocusableInput
        colors={colors}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="At least 6 characters"
        placeholderTextColor={colors.secondaryText}
        value={password}
        onChangeText={(v: string) => { setPassword(v); setAuthError(""); }}
        secureTextEntry
      />

      {authError ? (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{authError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16, opacity: canNext ? 1 : 0.4 }]}
        onPress={canNext && !authLoading ? onNext : undefined}
      >
        {authLoading
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <Text style={styles.primaryBtnText}>{signInMode ? "Sign In" : "Create Account"}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </>
          )
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Step 2: Basic Info ────────────────────────────────────────────────────────

function StepBasicInfo({ colors, username, setUsername, age, setAge, city, setCity, ageError, canNext, onNext }: any) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.stepTitle, { color: colors.text }]}>Tell us about yourself</Text>
      <Text style={[styles.stepSub, { color: colors.secondaryText }]}>This info appears on your profile.</Text>

      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Username *</Text>
      <FocusableInput
        colors={colors}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="e.g. Sara_J"
        placeholderTextColor={colors.secondaryText}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Age</Text>
      <FocusableInput
        colors={colors}
        style={[
          styles.input,
          { backgroundColor: colors.card, borderColor: ageError ? colors.danger : colors.border, color: colors.text },
        ]}
        placeholder="e.g. 16"
        placeholderTextColor={colors.secondaryText}
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
      />
      {ageError ? <Text style={[styles.fieldError, { color: colors.danger }]}>{ageError}</Text> : null}

      <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>City</Text>
      <FocusableInput
        colors={colors}
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="e.g. Jerusalem, Ramallah, Tel Aviv"
        placeholderTextColor={colors.secondaryText}
        value={city}
        onChangeText={setCity}
      />

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16, opacity: canNext ? 1 : 0.4 }]}
        onPress={canNext ? onNext : undefined}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Step 3: Interests ─────────────────────────────────────────────────────────

const PREDEFINED_LABELS = new Set(HOBBY_OPTIONS.map((h) => h.label));

function StepInterests({ colors, contentWidth, selected, onToggle, canNext, onNext }: any) {
  const [customInput, setCustomInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // Hobbies the user typed themselves (not in the predefined grid)
  const customHobbies: string[] = selected.filter((h: string) => !PREDEFINED_LABELS.has(h));

  function addCustomHobby() {
    const label = customInput.trim();
    if (!label) return;
    if (!selected.includes(label)) onToggle(label);
    setCustomInput("");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>What do you love?</Text>
        <Text style={[styles.stepSub, { color: colors.secondaryText }]}>
          Pick at least one. You can change these later.
        </Text>
      </View>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* Discover via quiz */}
        <View style={styles.discoverWrap}>
          <TouchableOpacity
            onPress={() => router.push("/quiz?returnTo=onboarding" as any)}
            style={[styles.discoverCard, { backgroundColor: colors.secondary, borderColor: colors.link ?? colors.primary }]}
          >
            <View style={[styles.discoverIcon, { backgroundColor: colors.link ?? colors.primary }]}>
              <Ionicons name="compass-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.discoverTitle, { color: colors.text }]}>Don't have a hobby?</Text>
              <Text style={[styles.discoverSub, { color: colors.secondaryText }]}>Let's discover together — take our 2-minute quiz</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.link ?? colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Predefined hobby tiles */}
        <View style={styles.hobbyGrid}>
          {HOBBY_OPTIONS.map((h) => {
            const active = selected.includes(h.label);
            return (
              <TouchableOpacity
                key={h.label}
                onPress={() => onToggle(h.label)}
                style={[
                  styles.hobbyTile,
                  {
                    width: (contentWidth - 56) / 3,
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                  onboardingCardShadow,
                ]}
              >
                <Ionicons name={h.icon} size={34} color={active ? "#fff" : colors.secondaryText} />
                <Text style={[styles.hobbyTileText, { color: active ? "#fff" : colors.text }]} numberOfLines={2}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom hobby input */}
        <View style={styles.customHobbySection}>
          <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>
            Don't see yours? Add it
          </Text>
          <View style={styles.customHobbyRow}>
            <FocusableInput
              colors={colors}
              style={[styles.customHobbyInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }, onboardingCardShadow]}
              placeholder="e.g. Skateboarding, Knitting…"
              placeholderTextColor={colors.secondaryText}
              value={customInput}
              onChangeText={setCustomInput}
              onSubmitEditing={addCustomHobby}
              returnKeyType="done"
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
            />
            <TouchableOpacity
              onPress={addCustomHobby}
              style={[styles.customAddBtn, { backgroundColor: customInput.trim() ? colors.primary : colors.border }]}
              disabled={!customInput.trim()}
            >
              <Ionicons name="add" size={22} color={customInput.trim() ? "#fff" : colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* Chips for custom hobbies */}
          {customHobbies.length > 0 && (
            <View style={styles.customChipsRow}>
              {customHobbies.map((h: string) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => onToggle(h)}
                  style={[styles.customChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}
                >
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text style={[styles.customChipText, { color: colors.primary }]}>{h}</Text>
                  <Ionicons name="close-circle" size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      <View style={styles.stepFooter}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canNext ? 1 : 0.4 }]}
          onPress={canNext ? onNext : undefined}
        >
          <Text style={styles.primaryBtnText}>
            {selected.length > 0 ? `Continue (${selected.length} selected)` : "Select at least 1"}
          </Text>
          {canNext && <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Step 4: Free Time ─────────────────────────────────────────────────────────

function StepFreeTime({ colors, value, onSelect, canNext, onNext }: any) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.stepTitle, { color: colors.text }]}>How much free time{"\n"}do you have daily?</Text>
      <Text style={[styles.stepSub, { color: colors.secondaryText }]}>
        This helps us suggest realistic hobby sessions.
      </Text>

      <View style={styles.freeTimeOptions}>
        {FREE_TIME_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={[
                styles.freeTimeCard,
                { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.freeTimeLabel, { color: active ? "#fff" : colors.text }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canNext ? 1 : 0.4 }]}
        onPress={canNext ? onNext : undefined}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Step 5: Feature Intro ─────────────────────────────────────────────────────

function StepFeatures({
  colors,
  onFinish,
  finishing,
  finishError,
}: {
  colors: any;
  onFinish: () => void;
  finishing: boolean;
  finishError: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={[styles.stepTitle, { color: colors.text }]}>You're all set! 🎉</Text>
      <Text style={[styles.stepSub, { color: colors.secondaryText }]}>Here's what Hobbily can do for you:</Text>

      {/* One flat, non-interactive panel — plain rows with a divider and a
          check icon, deliberately without the shadow/elevation/border
          treatment this screen uses for its actual buttons and inputs
          (onboardingCardShadow), so nothing here reads as pressable. */}
      <View style={[styles.featurePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.featurePanelLabel, { color: colors.secondaryText }]}>What you can do in Hobbily</Text>
        {FEATURES.map((f, i) => (
          <View key={f.title} style={[styles.featureRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>{f.title}</Text>
              <Text style={[styles.featureBody, { color: colors.secondaryText }]}>{f.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {finishError ? (
        <Text style={[styles.finishError, { color: colors.danger }]}>{finishError}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 24, opacity: finishing ? 0.7 : 1 }]}
        onPress={onFinish}
        disabled={finishing}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={finishing ? "Setting up your account" : "Enter Hobbily"}
        accessibilityState={{ disabled: finishing, busy: finishing }}
      >
        {finishing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Enter Hobbily</Text>
            <Ionicons name="rocket-outline" size={18} color="#fff" style={{ marginLeft: 6 }} />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 20, height: 6, borderRadius: 3 },
  stepWrap: { flex: 1 },
  stepContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
  },
  stepHeader: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 12 },
  stepFooter: { paddingHorizontal: 28, paddingBottom: 28 },
  stepTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginBottom: 8, lineHeight: 36 },
  stepSub: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  fieldError: { fontSize: 12, marginTop: -10, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
  },
  // Sign-up / sign-in mode toggle
  toggleModeRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  toggleModeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  toggleModeTxt: { fontSize: 14, fontWeight: "700" },
  // Error box
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
    ...onboardingCardShadow,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: { marginTop: 16, alignItems: "center", padding: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
  // Welcome
  welcomeLogo: { width: 100, height: 100, resizeMode: "contain", alignSelf: "center", marginBottom: 16, marginTop: 40 },
  welcomeTitle: { fontSize: 42, fontWeight: "900", textAlign: "center", letterSpacing: -1 },
  welcomeTagline: { fontSize: 18, textAlign: "center", lineHeight: 28, marginVertical: 16 },
  // Discover-via-quiz callout
  discoverWrap: { paddingHorizontal: 16, paddingTop: 16 },
  discoverCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", gap: 12 },
  discoverIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  discoverTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  discoverSub: { fontSize: 12, lineHeight: 16 },
  // Hobby grid — 3 columns so labels have room to breathe
  hobbyGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 12 },
  // Custom hobby adder
  customHobbySection: { paddingHorizontal: 16, paddingBottom: 16 },
  customHobbyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  customHobbyInput: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  customAddBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  customChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  customChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  customChipText: { fontSize: 13, fontWeight: "600" },
  hobbyTile: {
    // width is set inline per-tile from the live/capped content width (see
    // StepInterests) — not a static value, since it depends on window size.
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
  },
  hobbyTileText: { fontSize: 13, fontWeight: "600", textAlign: "center", lineHeight: 17 },
  // Free time
  freeTimeOptions: { gap: 10, marginBottom: 24 },
  freeTimeCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    ...onboardingCardShadow,
  },
  freeTimeLabel: { fontSize: 17, fontWeight: "700" },
  // Features — one flat, non-interactive panel (deliberately no
  // onboardingCardShadow/elevation here — that treatment is reserved for
  // this screen's actual buttons/inputs, so applying it to these rows would
  // make static information look pressable).
  featurePanel: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  featurePanelLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  featureBody: { fontSize: 13, lineHeight: 18 },
  finishError: { fontSize: 13, textAlign: "center", marginTop: 14, lineHeight: 18 },
  // Notice box (kept for potential future use)
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  noticeText: { flex: 1, fontSize: 13 },
});
