import { useEffect } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import AppTabBar from "../../components/AppTabBar";
import OnboardingTour from "../../components/OnboardingTour";
import { useProfile } from "../../context/ProfileContext";
import { useOnboardingTourController } from "../../context/OnboardingTourContext";
import { takeJustRegistered } from "../../services/onboardingTourBridge";

export default function TabsLayout() {
  const { profile, completeOnboardingTour } = useProfile();
  const { isTourVisible, originRoute, startTour, hideTour } = useOnboardingTourController();

  // Runs once, the first time this layout mounts after the post-signup
  // redirect to /(tabs)/ — see services/onboardingTourBridge.ts for why the
  // one-shot flag (rather than profile.hasSeenOnboardingTour alone) is what
  // decides "new registration" vs. "existing account signing in". Settings'
  // "Replay App Tour" row triggers the same tour on demand later via the
  // same startTour() from OnboardingTourContext — that's why visibility
  // lives there rather than as local state here.
  useEffect(() => {
    if (takeJustRegistered() && !profile.hasSeenOnboardingTour) {
      startTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFinishTour() {
    hideTour();
    completeOnboardingTour();
  }

  return (
    <>
      {/* Hidden from the accessibility tree while the tour overlay is up —
          otherwise a screen reader could still reach tab content the tour
          has visually dimmed and blocked touches on. */}
      <View style={{ flex: 1 }} accessibilityElementsHidden={isTourVisible} importantForAccessibility={isTourVisible ? "no-hide-descendants" : "auto"}>
        <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
          <Tabs.Screen name="index" options={{ title: "Home" }} />
          <Tabs.Screen name="opportunities" options={{ title: "Explore" }} />
          <Tabs.Screen name="community" options={{ title: "Community" }} />
          <Tabs.Screen name="time-manager" options={{ title: "Planner" }} />
          <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        </Tabs>
      </View>
      <OnboardingTour visible={isTourVisible} originRoute={originRoute} onFinish={handleFinishTour} />
    </>
  );
}
