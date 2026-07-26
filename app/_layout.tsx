import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { LocalAvatarProvider } from "../context/LocalAvatarContext";
import { ProfileProvider, useProfile } from "../context/ProfileContext";
import { PostsProvider, usePosts } from "../context/PostsContext";
import { TimeProvider, useTime } from "../context/TimeContext";
import { CommunityProvider } from "../context/CommunityContext";
import { ProgressProvider, useProgress } from "../context/ProgressContext";
import { FriendsProvider } from "../context/FriendsContext";
import { Image, Animated, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TipsResetProvider } from "../components/TipBanner";
import PracticeTimerModal from "../components/PracticeTimerModal";
import AchievementUnlockToast from "../components/achievements/AchievementUnlockToast";
import { useEffect, useRef, useState } from "react";

function AppShell() {
  const { isLoading } = usePosts();
  const { profile, isLoaded } = useProfile();
  const { isAuthLoaded, user } = useAuth();
  const { colors, isDark, isReady: themeReady } = useTheme();
  const { dueOccurrence, dismissDueTask, deleteTask, deleteOccurrence } = useTime();
  const { recordSession } = useProgress();
  const opacity = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);
  const redirected = useRef(false);

  // Wait for Firebase auth state + Firestore profile load + the theme
  // preference to resolve (local device value, or the profile's saved one)
  // — the last of these keeps the splash up just long enough that the first
  // real frame is never a light/dark flash.
  const allReady = isAuthLoaded && isLoaded && !isLoading && themeReady;

  useEffect(() => {
    if (!allReady) return;
    Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
      setShowSplash(false);
      if (!redirected.current) {
        redirected.current = true;
        if (!user || !profile.hasOnboarded) {
          router.replace("/onboarding" as any);
        }
      }
    });
  }, [allReady]);

  // Redirect to onboarding when user signs out or deletes their account after initial load
  useEffect(() => {
    if (!redirected.current) return; // splash not done yet — initial effect handles this
    if (!user) {
      router.replace("/onboarding" as any);
    }
  }, [user]);

  // Redirect to tabs when a user signs in from the onboarding screen after the splash
  // has already completed (e.g. signed out then signed back in).
  useEffect(() => {
    if (!redirected.current) return; // splash not done yet — initial effect handles this
    if (user && isLoaded && profile.hasOnboarded) {
      router.replace("/(tabs)/" as any);
    }
  }, [user, isLoaded, profile.hasOnboarded]);

  return (
    <>
      {/* Keeps the native status bar icons/text readable against the current
          in-app theme — independent of the device's system color scheme. */}
      <StatusBar style={isDark ? "light" : "dark"} />
      {/*
        Subtle cross-screen fade for the primary stack (native-stack, backed by
        react-native-screens, only exposes fixed animation presets — no custom
        JS interpolator for an exact "4-8px translate", so a short fade is the
        closest faithful match without swapping to the JS stack navigator).
        create-post gets its own modal-style slide-up per the composer redesign.
      */}
      <Stack
        initialRouteName="(tabs)"
        screenOptions={{ headerShown: false, animation: "fade", animationDuration: 200 }}
      >
        <Stack.Screen
          name="create-post"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
      {showSplash && (
        <Animated.View
          style={[styles.splash, { backgroundColor: colors.background, opacity }]}
          pointerEvents="none"
        >
          <Image source={require("../assets/images/Hobbily_Logo.png")} style={styles.splashLogo} />
        </Animated.View>
      )}
      {/* Pops up automatically whenever a scheduled task's time arrives, wherever the user is in the app */}
      {!showSplash && dueOccurrence && (
        <PracticeTimerModal
          visible
          onClose={async () => {
            // Whether the session was finished or skipped/discarded, its slot
            // has passed. For a one-off task that means the task itself is
            // done, same as before. For a recurring series it must NOT delete
            // the whole series — only today's occurrence — so future days
            // keep firing normally.
            if (dueOccurrence.isRecurring) {
              await deleteOccurrence(dueOccurrence, "this");
            } else {
              await deleteTask(dueOccurrence.task.id);
            }
            dismissDueTask();
          }}
          onComplete={async (minutes) => {
            await recordSession(minutes);
          }}
          defaultTitle={dueOccurrence.title}
          defaultMinutes={dueOccurrence.duration}
          colors={colors}
          autoStart
          banner="It's time!"
        />
      )}
      {!showSplash && <AchievementUnlockToast colors={colors} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TipsResetProvider>
      <AuthProvider>
        <LocalAvatarProvider>
        <ProfileProvider>
          {/* ThemeProvider reads useProfile() for the signed-in user's saved
              theme preference (see context/ThemeContext.tsx priority order),
              so it must sit below ProfileProvider in the tree. */}
          <ThemeProvider>
            <PostsProvider>
              <TimeProvider>
                <CommunityProvider>
                  <ProgressProvider>
                    <FriendsProvider>
                      <AppShell />
                    </FriendsProvider>
                  </ProgressProvider>
                </CommunityProvider>
              </TimeProvider>
            </PostsProvider>
          </ThemeProvider>
        </ProfileProvider>
        </LocalAvatarProvider>
      </AuthProvider>
      </TipsResetProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  splashLogo: { width: 200, height: 200, resizeMode: "contain" },
});
