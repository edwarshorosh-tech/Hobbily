import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { useState, useRef, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import { useProgress } from "../../context/ProgressContext";
import { useTime } from "../../context/TimeContext";
import { useAuth } from "../../context/AuthContext";
import { usePosts } from "../../context/PostsContext";
import TagChip from "../../components/TagChip";
import ConfirmModal from "../../components/ConfirmModal";
import PostCard from "../../components/PostCard";
import PostCardSkeleton from "../../components/post/PostCardSkeleton";
import UserCardSheet from "../../components/user-card/UserCardSheet";
import { useAuthorPosts } from "../../hooks/useAuthorPosts";
import SwipeableTab from "../../components/SwipeableTab";
import { TIP_KEYS, useTipsReset } from "../../components/TipBanner";
import FriendsSection from "../../components/friends/FriendsSection";
import HobbiesShowAllModal from "../../components/friends/HobbiesShowAllModal";
import ExpandableIdentityCard from "../../components/profile/ExpandableIdentityCard";
import SectionCardHeader from "../../components/profile/SectionCardHeader";
import StreakButton from "../../components/home/StreakButton";
import StreakInfoModal from "../../components/home/StreakInfoModal";
import HobbiesEditor from "../../components/settings/HobbiesEditor";
import FriendAvatar from "../../components/friends/FriendAvatar";
import * as ImagePicker from "expo-image-picker";
import { uploadAvatar, removeAvatar, avatarErrorMessage, AvatarServiceError } from "../../services/storageService";
import { Achievement } from "../../types/Progress";
import { ACHIEVEMENT_DEFS, AchievementDef, MAX_FEATURED_ACHIEVEMENTS } from "../../constants/achievements";
import AchievementDetailSheet from "../../components/achievements/AchievementDetailSheet";
import LocalitySearchInput from "../../components/LocalitySearchInput";
import { brand } from "../../constants/colors";
import { shouldFocusFriendsWidget } from "../../utils/profileNavigation";

// Overview hobbies: how many chips to show before collapsing behind "Show all".
const HOBBIES_PREVIEW_COUNT = 8;

// ── AchievementTile ───────────────────────────────────────────────────────────
function AchievementTile({
  def,
  earned,
  colors,
  onPress,
}: {
  def: AchievementDef;
  earned: Achievement | undefined;
  colors: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${def.title}${earned ? ", unlocked" : ", locked"} — view details`}
      style={[
        styles.achieveTile,
        {
          backgroundColor: earned ? colors.primary : colors.card,
          borderColor: earned ? colors.primary : colors.border,
          opacity: earned ? 1 : 0.5,
        },
      ]}
    >
      <Ionicons
        name={def.icon as any}
        size={28}
        color={earned ? "#fff" : colors.secondaryText}
      />
      <Text
        style={[styles.achieveTitle, { color: earned ? "#fff" : colors.text }]}
        numberOfLines={1}
      >
        {def.title}
      </Text>
      <Text
        style={[styles.achieveDesc, { color: earned ? "rgba(255,255,255,0.8)" : colors.secondaryText }]}
        numberOfLines={2}
      >
        {def.description}
      </Text>
      {earned && (
        <Text style={styles.achieveDate}>{earned.earnedAt}</Text>
      )}
    </TouchableOpacity>
  );
}

// ── ToggleRow ─────────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  sublabel,
  value,
  onToggle,
  colors,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onToggle: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.toggleSub, { color: colors.secondaryText }]}>{sublabel}</Text>
        ) : null}
      </View>
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: value ? colors.primary : colors.border },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            { transform: [{ translateX: value ? 20 : 2 }] },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

// ── DeleteAccountModal ────────────────────────────────────────────────────────
function DeleteAccountModal({
  visible,
  onCancel,
  onConfirm,
  colors,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
  colors: any;
}) {
  const [checked, setChecked] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canDelete = checked && confirmText.trim() === "DELETE" && password.length > 0;

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      await onConfirm(password);
      // On success the user is redirected away — no need to close manually
    } catch (e: any) {
      setLoading(false);
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        setError("Incorrect password. Please try again.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
    }
  }

  function handleCancel() {
    setChecked(false);
    setConfirmText("");
    setPassword("");
    setError("");
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.deleteModal, { backgroundColor: colors.card, borderColor: brand.criticalDanger }]}>
          <Ionicons name="warning-outline" size={36} color={brand.criticalDanger} style={{ alignSelf: "center" }} />
          <Text style={[styles.deleteTitle, { color: colors.text }]}>Delete Account</Text>
          <Text style={[styles.deleteBody, { color: colors.secondaryText }]}>
            This will permanently delete your profile, progress, and all your data. This cannot be undone.
          </Text>

          {/* Step 1: checkbox */}
          <TouchableOpacity style={styles.checkRow} onPress={() => setChecked(!checked)} activeOpacity={0.7}>
            <View style={[styles.checkbox, { borderColor: brand.criticalDanger, backgroundColor: checked ? brand.criticalDanger : "transparent" }]}>
              {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkLabel, { color: colors.text }]}>
              I understand this is permanent and cannot be undone.
            </Text>
          </TouchableOpacity>

          {/* Step 2: type DELETE */}
          <Text style={[styles.deleteHint, { color: colors.secondaryText }]}>
            Type <Text style={{ color: brand.criticalDanger, fontWeight: "700" }}>DELETE</Text> to confirm:
          </Text>
          <TextInput
            style={[styles.deleteInput, { color: colors.text, borderColor: confirmText === "DELETE" ? brand.criticalDanger : colors.border, backgroundColor: colors.inputBackground }]}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            placeholder="DELETE"
            placeholderTextColor={colors.secondaryText}
          />

          {/* Step 3: password */}
          <Text style={[styles.deleteHint, { color: colors.secondaryText }]}>
            Enter your password:
          </Text>
          <TextInput
            style={[styles.deleteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground, letterSpacing: 0 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Your password"
            placeholderTextColor={colors.secondaryText}
          />

          {error ? (
            <Text style={{ color: brand.criticalDanger, fontSize: 13, textAlign: "center" }}>{error}</Text>
          ) : null}

          <View style={styles.deleteActions}>
            <TouchableOpacity
              style={[styles.deleteCancelBtn, { borderColor: colors.border }]}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={[styles.deleteCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteConfirmBtn, { backgroundColor: canDelete ? brand.criticalDanger : colors.border }]}
              onPress={handleDelete}
              disabled={!canDelete || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.deleteConfirmText}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────
/** A single icon + label + value row, used inside the read-only Account card. */
function InfoRow({
  icon,
  label,
  value,
  colors,
  divider = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: any;
  divider?: boolean;
}) {
  return (
    <>
      <View style={styles.infoRow}>
        <Ionicons name={icon} size={18} color={colors.secondaryText} />
        <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
          {value}
        </Text>
      </View>
      {divider && <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />}
    </>
  );
}

// ── SettingsField ─────────────────────────────────────────────────────────────
/** Labeled input with an icon, a proper focus border, and an optional inline error / character counter. */
function SettingsField({
  label,
  icon,
  value,
  onChangeText,
  colors,
  placeholder,
  keyboardType,
  error,
  multiline,
  maxLength,
  showCounter,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (v: string) => void;
  colors: any;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  showCounter?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        {icon && <Ionicons name={icon} size={14} color={colors.secondaryText} />}
        <Text style={[styles.fieldLabelText, { color: colors.secondaryText }]}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryText}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMultiline,
          {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      />
      {(error || (showCounter && maxLength)) ? (
        <View style={styles.fieldFooterRow}>
          <Text style={[styles.fieldError, { color: colors.danger }]}>{error ?? ""}</Text>
          {showCounter && maxLength ? (
            <Text style={[styles.fieldCounter, { color: colors.secondaryText }]}>
              {value.length}/{maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
type TabId = "overview" | "posts" | "badges" | "settings";

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { profile, saveProfile, updateAvatar, updatePersonalityVisibility } = useProfile();
  const [personalityVisibilitySaving, setPersonalityVisibilitySaving] = useState(false);
  const { achievements, currentStreak, totalSessions, totalMinutes } = useProgress();
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | null>(null);
  const { dailyReminderEnabled, setDailyReminderEnabled, resetDailyBanner } = useTime();
  const { signOut, deleteAccount, user } = useAuth();
  const { deletePost } = usePosts();
  const { bump: bumpTips } = useTipsReset();
  const params = useLocalSearchParams<{ tab?: string; openRequests?: string; focus?: string }>();

  // Posts is the default landing tab (deep links to overview/badges/settings
  // still work) — computed synchronously into useState's initial value below,
  // never switched to after an "overview" flash post-mount.
  const initialTab: TabId =
    params.tab === "overview" || params.tab === "badges" || params.tab === "settings" || params.tab === "posts"
      ? params.tab
      : "posts";

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [draft, setDraft] = useState({ ...profile });
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [tipsResetDone, setTipsResetDone] = useState(false);
  const [hobbiesModalVisible, setHobbiesModalVisible] = useState(false);
  const [autoOpenRequests, setAutoOpenRequests] = useState(params.openRequests === "1");
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<TabId | null>(null);
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [removeAvatarConfirmVisible, setRemoveAvatarConfirmVisible] = useState(false);
  const [cardUid, setCardUid] = useState<string | null>(null);

  // "Add Friends" from the Home leaderboard's empty state deep-links here
  // with ?tab=overview&focus=friends — this scrolls to and briefly
  // highlights the Friends widget once the Overview tab has actually laid
  // out, rather than assuming a fixed pixel offset (the identity card above
  // it can grow/shrink with bio length, hobby count, font scale, etc.).
  const scrollViewRef = useRef<ScrollView>(null);
  const friendsAnchorRef = useRef<View>(null);
  const pendingFocusFriendsRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const friendsFocusRetryRef = useRef(0);
  const [highlightFriends, setHighlightFriends] = useState(false);
  const highlightProgress = useRef(new Animated.Value(0)).current;

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile]);

  // Avatar changes save immediately (see handlePickAvatar/handleRemoveAvatar) and
  // are not part of the Settings draft/save flow — keep draft.avatarUrl mirrored
  // to the committed profile so an avatar change never spuriously enables
  // "Save Changes" or gets reverted by "Discard changes".
  useEffect(() => {
    setDraft((d) => (d.avatarUrl === profile.avatarUrl ? d : { ...d, avatarUrl: profile.avatarUrl }));
  }, [profile.avatarUrl]);

  async function handlePickAvatar() {
    if (avatarUploading) return;
    setAvatarError(null);
    if (!user) {
      setAvatarError(avatarErrorMessage("not-authenticated"));
      return;
    }

    // The permission request and picker launch previously ran outside any
    // try/catch — if either rejected (e.g. no media-library permission
    // module available, picker cancelled by the OS mid-flow), the failure
    // was an unhandled promise rejection with zero UI feedback: the button
    // looked like it did nothing. Everything from here on is now covered.
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setAvatarError(avatarErrorMessage("permission-denied"));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      // User cancellation is not an error — no message, no thrown exception.
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setAvatarUploading(true);
      // Old avatar stays on screen (avatarUrl only changes on success below)
      // — a failed upload never leaves the user with a broken image.
      const url = await uploadAvatar(user.uid, result.assets[0].uri, result.assets[0].mimeType);
      try {
        await updateAvatar(url);
      } catch (e) {
        throw new AvatarServiceError("profile-update-failed", e instanceof Error ? e.message : undefined);
      }
    } catch (e) {
      if (__DEV__) console.warn("[Profile] avatar upload failed", e);
      const code = e instanceof AvatarServiceError ? e.code : "unknown";
      setAvatarError(avatarErrorMessage(code));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRemoveAvatarConfirmed() {
    setRemoveAvatarConfirmVisible(false);
    if (avatarUploading) return;
    setAvatarError(null);
    if (!user) {
      setAvatarError(avatarErrorMessage("not-authenticated"));
      return;
    }
    setAvatarUploading(true);
    try {
      await removeAvatar(user.uid);
      try {
        await updateAvatar(null);
      } catch (e) {
        throw new AvatarServiceError("profile-update-failed", e instanceof Error ? e.message : undefined);
      }
    } catch (e) {
      if (__DEV__) console.warn("[Profile] avatar removal failed", e);
      const code = e instanceof AvatarServiceError ? e.code : "delete-failed";
      setAvatarError(avatarErrorMessage(code));
    } finally {
      setAvatarUploading(false);
    }
  }

  // Short subtle cross-fade when switching Profile tabs — reuses the same
  // Animated API pattern as the rest of the app (splash fade, onboarding step
  // transitions); no new animation dependency.
  const tabFade = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    tabFade.setValue(reduceMotion ? 1 : 0);
    Animated.timing(tabFade, {
      toValue: 1,
      duration: reduceMotion ? 0 : 160,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reduceMotion]);

  // Consumed once per request (like openRequests above) — a later plain
  // visit to Profile (no focus param) never re-triggers this.
  useEffect(() => {
    if (!shouldFocusFriendsWidget(params.focus)) return;
    pendingFocusFriendsRef.current = true;
    setActiveTab("overview");
    router.setParams({ focus: undefined });
  }, [params.focus]);

  // Scrolls to and highlights the Friends widget without ever calling
  // ref.measureLayout(scrollNode, ...): under this app's New Architecture
  // (Fabric) config, getScrollableNode()'s handle is not recognized by
  // measureLayout as "a ref to a native component", which is exactly what
  // threw "ref.measureLayout must be called with a ref to a native
  // component" when Add Friends was pressed from an empty leaderboard.
  // measureInWindow has no such relative-ref argument (it just reports a
  // component's own on-screen position), so it doesn't hit that check —
  // combined with the ScrollView's own on-screen position and its current
  // scroll offset (tracked via onScroll), that's enough to compute the
  // exact scrollTo target without any hardcoded Y.
  function focusFriendsAnchor() {
    // ScrollView does implement measureInWindow at runtime (it delegates to
    // its inner native scroll view), but its TS type doesn't declare
    // NativeMethods — hence the cast.
    const scrollMeasurable = scrollViewRef.current as unknown as { measureInWindow?: (cb: (x: number, y: number) => void) => void } | null;
    friendsAnchorRef.current?.measureInWindow((_ax: number, anchorPageY: number) => {
      scrollMeasurable?.measureInWindow?.((_sx: number, scrollPageY: number) => {
        // Both callbacks report 0 before layout has actually committed —
        // bounded retry (not an infinite loop) instead of scrolling to a
        // wrong/zero position.
        if (anchorPageY === 0 && scrollPageY === 0 && friendsFocusRetryRef.current < 5) {
          friendsFocusRetryRef.current += 1;
          requestAnimationFrame(focusFriendsAnchor);
          return;
        }
        friendsFocusRetryRef.current = 0;
        const targetY = scrollOffsetRef.current + (anchorPageY - scrollPageY) - 12;
        scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
      });
    });
  }

  function handleFriendsAnchorLayout() {
    if (!pendingFocusFriendsRef.current) return;
    pendingFocusFriendsRef.current = false;
    // One frame so the just-mounted Overview content (identity card + tab
    // selector above it) has settled before measuring its real offset —
    // never a hardcoded Y, since bio length/hobby count/font scale all
    // change how tall that content is.
    requestAnimationFrame(() => {
      focusFriendsAnchor();
      setHighlightFriends(true);
    });
  }

  useEffect(() => {
    if (!highlightFriends) return;
    Animated.sequence([
      Animated.timing(highlightProgress, { toValue: 1, duration: reduceMotion ? 0 : 220, useNativeDriver: false }),
      Animated.delay(reduceMotion ? 700 : 1400),
      Animated.timing(highlightProgress, { toValue: 0, duration: reduceMotion ? 0 : 400, useNativeDriver: false }),
    ]).start(() => setHighlightFriends(false));
  }, [highlightFriends, reduceMotion, highlightProgress]);

  function handleTabPress(id: TabId) {
    if (activeTab === "settings" && id !== "settings" && hasChanges) {
      setPendingTabSwitch(id);
      setDiscardConfirmVisible(true);
      return;
    }
    setActiveTab(id);
  }

  function handleDiscardChanges() {
    setDiscardConfirmVisible(false);
    setDraft({ ...profile });
    setSaveFailure(null);
    if (pendingTabSwitch) {
      setActiveTab(pendingTabSwitch);
      setPendingTabSwitch(null);
    }
  }

  const ageNum = parseInt(draft.age, 10);
  const ageError =
    draft.age !== "" && (isNaN(ageNum) || ageNum < 13 || ageNum > 18) ? "Age must be between 13 and 18." : "";

  function requestSave() {
    setSaveModalVisible(true);
  }

  async function handleConfirmSave() {
    setSaveModalVisible(false);
    if (ageError || saving) return;
    setSaving(true);
    setSaveFailure(null);
    try {
      await saveProfile(draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      if (__DEV__) console.warn("[Profile] save failed", e);
      setSaveFailure("Couldn't save your changes. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetTips() {
    await AsyncStorage.multiRemove([
      ...Object.values(TIP_KEYS),
      "@hobbily_reminder_shown_date",
    ]);
    bumpTips();        // signal all mounted TipBanners to re-read AsyncStorage
    resetDailyBanner(); // restore the planner daily reminder banner
    setTipsResetDone(true);
    setTimeout(() => setTipsResetDone(false), 2000);
  }

  const { posts: myPosts, isLoading: myPostsLoading, loadError: myPostsError, hasMore: myPostsHasMore, loadingMore: myPostsLoadingMore, loadMore: loadMoreMyPosts } = useAuthorPosts(user?.uid ?? null);

  const TABS: { id: TabId; label: string }[] = [
    { id: "posts", label: "Posts" },
    { id: "overview", label: "Overview" },
    { id: "badges", label: "Badges" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <SwipeableTab tabIndex={4} backgroundColor={colors.background} colors={colors}>
      {/* Bottom inset excluded — the Tabs navigator's own tab bar already
          reserves it (see hooks/useTabBarHeight.ts); the sticky Save footer
          below also needs to sit flush above the tab bar, not floating
          above an extra reserved gap. */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <StreakButton streak={currentStreak ?? 0} colors={colors} onPress={() => setStreakModalVisible(true)} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={{ paddingBottom: activeTab === "settings" ? 8 : 100 }}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
        >
          {/* Expandable identity card */}
          <ExpandableIdentityCard
            username={draft.username}
            city={draft.city}
            age={draft.age}
            bio={draft.bio}
            avatarUrl={profile.avatarUrl}
            colors={colors}
            personalityTypeName={profile.showPersonalityType ? profile.personalityTypeName : null}
            onEditProfile={() => handleTabPress("settings")}
          />

          {/* Tab selector */}
          <View style={[styles.tabSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tabPill,
                  activeTab === t.id && { backgroundColor: colors.primary },
                ]}
                onPress={() => handleTabPress(t.id)}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    { color: activeTab === t.id ? "#fff" : colors.secondaryText },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Animated.View style={{ opacity: tabFade }}>
            {/* ── Overview tab ─────────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <View style={styles.overviewContent}>
                {/* Friends */}
                <View ref={friendsAnchorRef} onLayout={handleFriendsAnchorLayout} style={styles.friendsAnchor}>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      styles.friendsHighlight,
                      {
                        borderColor: highlightProgress.interpolate({ inputRange: [0, 1], outputRange: ["transparent", colors.primary] }),
                        backgroundColor: highlightProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["transparent", `${colors.primary}14`],
                        }),
                      },
                    ]}
                  />
                  <FriendsSection
                    colors={colors}
                    autoOpenRequests={autoOpenRequests}
                    onAutoOpenHandled={() => {
                      setAutoOpenRequests(false);
                      router.setParams({ openRequests: undefined });
                    }}
                  />
                </View>

                {/* My Hobbies */}
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <SectionCardHeader
                    icon="sparkles-outline"
                    title="My Hobbies"
                    count={draft.hobbies.length}
                    colors={colors}
                    action={
                      draft.hobbies.length > HOBBIES_PREVIEW_COUNT ? (
                        <TouchableOpacity
                          onPress={() => setHobbiesModalVisible(true)}
                          style={styles.showAllBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Show all ${draft.hobbies.length} hobbies`}
                        >
                          <Text style={[styles.showAllText, { color: colors.primary }]}>
                            Show all ({draft.hobbies.length})
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      ) : undefined
                    }
                  />
                  {draft.hobbies.length > 0 ? (
                    <View style={styles.tagWrap}>
                      {draft.hobbies.slice(0, HOBBIES_PREVIEW_COUNT).map((tag) => (
                        <TagChip key={tag} label={tag} textColor="#fff" backgroundColor={colors.primary} />
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.aboutText, { color: colors.secondaryText }]}>
                      No hobbies added yet.
                    </Text>
                  )}
                </View>
              </View>
            )}

          {/* ── Posts tab ────────────────────────────────────────────────── */}
          {activeTab === "posts" && (
            <View style={{ padding: 16, paddingTop: 8 }}>
              <View style={styles.postsSectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>My Posts</Text>
                <TouchableOpacity onPress={() => router.push("/create-post" as any)}>
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {myPostsLoading ? (
                <>
                  <PostCardSkeleton colors={colors} />
                  <PostCardSkeleton colors={colors} />
                </>
              ) : myPostsError ? (
                <View style={[styles.postsEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="cloud-offline-outline" size={36} color={colors.secondaryText} />
                  <Text style={[styles.postsEmptyText, { color: colors.secondaryText }]}>{myPostsError}</Text>
                </View>
              ) : myPosts.length === 0 ? (
                <View style={[styles.postsEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="newspaper-outline" size={36} color={colors.secondaryText} />
                  <Text style={[styles.postsEmptyText, { color: colors.secondaryText }]}>
                    You haven't posted anything yet.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/create-post" as any)}
                    style={[styles.postsCreateBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.postsCreateBtnText}>Create your first post</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {myPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      colors={colors}
                      authorAvatarUrl={profile.avatarUrl}
                      onEdit={() => router.push(`/edit-post/${post.id}` as any)}
                      onDelete={() => deletePost(post.id)}
                      onOpenUser={setCardUid}
                    />
                  ))}
                  {myPostsHasMore && (
                    <TouchableOpacity
                      onPress={loadMoreMyPosts}
                      disabled={myPostsLoadingMore}
                      style={[styles.postsCreateBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: "center" }]}
                      accessibilityRole="button"
                      accessibilityLabel="Load more posts"
                    >
                      {myPostsLoadingMore ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Text style={{ color: colors.text, fontWeight: "600" }}>Load more</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── Badges tab ───────────────────────────────────────────────── */}
          {activeTab === "badges" && (
            <View style={{ padding: 16, paddingTop: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Achievements</Text>
              <Text style={[styles.sectionSub, { color: colors.secondaryText }]}>
                {achievements.length} / {ACHIEVEMENT_DEFS.length} earned
              </Text>
              <View style={styles.achieveGrid}>
                {ACHIEVEMENT_DEFS.map((def) => {
                  const earned = achievements.find((a) => a.id === def.id);
                  return (
                    <AchievementTile
                      key={def.id}
                      def={def}
                      earned={earned}
                      colors={colors}
                      onPress={() => setSelectedAchievementId(def.id)}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Settings tab ─────────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <View style={{ padding: 16, paddingTop: 8, gap: 20 }}>
              {/* 8.1 Profile Details card — photo management, username/age/city, about me.
                  No standalone avatar+username summary card: the expandable identity
                  card above the tab bar already provides that identity preview. */}
              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Profile Details</Text>

                <View style={styles.photoRow}>
                  <View style={styles.photoAvatarWrap}>
                    <FriendAvatar username={draft.username} avatarUrl={profile.avatarUrl} size={64} colors={colors} />
                    {avatarUploading && (
                      <View style={styles.avatarOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.photoLabel, { color: colors.text }]}>Profile photo</Text>
                    <View style={styles.photoActionsRow}>
                      <TouchableOpacity
                        onPress={handlePickAvatar}
                        disabled={avatarUploading}
                        accessibilityRole="button"
                        accessibilityLabel="Change photo"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[styles.photoActionText, { color: colors.primary, opacity: avatarUploading ? 0.5 : 1 }]}>
                          Change photo
                        </Text>
                      </TouchableOpacity>
                      {profile.avatarUrl ? (
                        <TouchableOpacity
                          onPress={() => setRemoveAvatarConfirmVisible(true)}
                          disabled={avatarUploading}
                          accessibilityRole="button"
                          accessibilityLabel="Remove photo"
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={[styles.photoActionText, { color: colors.danger, opacity: avatarUploading ? 0.5 : 1 }]}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
                {avatarError ? (
                  <Text style={[styles.avatarErrorText, { color: colors.danger }]}>{avatarError}</Text>
                ) : null}

                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />

                <SettingsField
                  label="Username"
                  icon="person-outline"
                  value={draft.username}
                  onChangeText={(username) => setDraft({ ...draft, username })}
                  colors={colors}
                  placeholder="e.g. Sara_J"
                />
                <SettingsField
                  label="Age"
                  icon="calendar-outline"
                  value={draft.age}
                  onChangeText={(age) => setDraft({ ...draft, age })}
                  colors={colors}
                  placeholder="e.g. 16"
                  keyboardType="number-pad"
                  error={ageError}
                />
                <View style={styles.fieldGroup}>
                  <View style={styles.fieldLabelRow}>
                    <Ionicons name="location-outline" size={14} color={colors.secondaryText} />
                    <Text style={[styles.fieldLabelText, { color: colors.secondaryText }]}>City</Text>
                  </View>
                  <LocalitySearchInput
                    colors={colors}
                    value={draft.city}
                    onChange={(city, meta) => setDraft({ ...draft, city, localityId: meta.localityId, locationSource: meta.locationSource })}
                    placeholder="Search your city, town, or village"
                  />
                </View>

                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />

                <SettingsField
                  label="About Me"
                  icon="document-text-outline"
                  value={draft.bio}
                  onChangeText={(bio) => setDraft({ ...draft, bio: bio.slice(0, 300) })}
                  colors={colors}
                  placeholder="Tell others what you're into and what you're working on…"
                  multiline
                  maxLength={300}
                  showCounter
                />
              </View>

              {/* 8.2 Hobbies card — HobbiesEditor renders its own internal header (title + count) */}
              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <HobbiesEditor
                  hobbies={draft.hobbies}
                  onChange={(hobbies) => setDraft({ ...draft, hobbies })}
                  colors={colors}
                  disabled={saving}
                  title="Hobbies"
                />
              </View>

              {/* 8.3 Featured achievements — only unlocked achievements are selectable, capped at MAX_FEATURED_ACHIEVEMENTS. Persisted via the same draft/Save Changes flow as the rest of this tab. */}
              <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Featured Achievements</Text>
                {achievements.length === 0 ? (
                  <Text style={[styles.sectionSub, { color: colors.secondaryText, marginTop: 4 }]}>
                    Unlock an achievement to feature it on your profile.
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.sectionSub, { color: colors.secondaryText, marginTop: 4, marginBottom: 10 }]}>
                      Pick up to {MAX_FEATURED_ACHIEVEMENTS} to highlight on your profile ({draft.featuredAchievementIds.length}/{MAX_FEATURED_ACHIEVEMENTS} selected)
                    </Text>
                    <View style={styles.featuredGrid}>
                      {ACHIEVEMENT_DEFS.filter((def) => achievements.some((a) => a.id === def.id)).map((def) => {
                        const selected = draft.featuredAchievementIds.includes(def.id);
                        return (
                          <TouchableOpacity
                            key={def.id}
                            onPress={() => {
                              const already = draft.featuredAchievementIds.includes(def.id);
                              if (already) {
                                setDraft({ ...draft, featuredAchievementIds: draft.featuredAchievementIds.filter((id) => id !== def.id) });
                              } else if (draft.featuredAchievementIds.length < MAX_FEATURED_ACHIEVEMENTS) {
                                setDraft({ ...draft, featuredAchievementIds: [...draft.featuredAchievementIds, def.id] });
                              }
                            }}
                            activeOpacity={0.75}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={def.title}
                            style={[
                              styles.featuredChip,
                              {
                                backgroundColor: selected ? colors.primary : colors.background,
                                borderColor: selected ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Ionicons name={def.icon as any} size={16} color={selected ? "#fff" : colors.text} />
                            <Text style={[styles.featuredChipText, { color: selected ? "#fff" : colors.text }]} numberOfLines={1}>
                              {def.title}
                            </Text>
                            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Personality Quiz</Text>
              {profile.personalityTypeName ? (
                <>
                  <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <InfoRow icon="sparkles-outline" label="Your result" value={profile.personalityTypeName} colors={colors} divider={false} />
                  </View>
                  <ToggleRow
                    label="Show my personality type"
                    sublabel="Let other users see this on your profile card"
                    value={profile.showPersonalityType}
                    onToggle={async () => {
                      if (personalityVisibilitySaving) return;
                      setPersonalityVisibilitySaving(true);
                      try {
                        await updatePersonalityVisibility(!profile.showPersonalityType);
                      } catch (e) {
                        if (__DEV__) console.warn("[Profile] personality visibility toggle failed", e);
                      } finally {
                        setPersonalityVisibilitySaving(false);
                      }
                    }}
                    colors={colors}
                  />
                  <TouchableOpacity
                    style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push("/quiz" as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.actionRowLabel, { color: colors.text }]}>Retake the quiz</Text>
                      <Text style={[styles.actionRowSub, { color: colors.secondaryText }]}>Get a fresh hobby archetype</Text>
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push("/quiz" as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.actionRowLabel, { color: colors.text }]}>Take the Hidden Hobbies Quiz</Text>
                    <Text style={[styles.actionRowSub, { color: colors.secondaryText }]}>Find your hobby archetype</Text>
                  </View>
                </TouchableOpacity>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Appearance</Text>
              <ToggleRow
                label="Dark Mode"
                sublabel={isDark ? "Currently dark" : "Currently light"}
                value={isDark}
                onToggle={toggleTheme}
                colors={colors}
              />

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Notifications</Text>
              <ToggleRow
                label="Daily Practice Reminder"
                sublabel="Get a reminder to practice each day"
                value={dailyReminderEnabled}
                onToggle={() => setDailyReminderEnabled(!dailyReminderEnabled)}
                colors={colors}
              />

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Tips & Hints</Text>
              <TouchableOpacity
                style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleResetTips}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.actionRowLabel, { color: colors.text }]}>
                    Reset dismissed tips
                  </Text>
                  <Text style={[styles.actionRowSub, { color: colors.secondaryText }]}>
                    Show all tips and daily banners again
                  </Text>
                </View>
                {tipsResetDone && (
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                )}
              </TouchableOpacity>

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 4 }]}>Account</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <InfoRow icon="mail-outline" label="Email" value={profile.email || "Not set"} colors={colors} />
                <InfoRow icon="cloud-outline" label="Storage" value="Firebase Cloud" colors={colors} />
                <InfoRow icon="information-circle-outline" label="Version" value="1.1.0" colors={colors} divider={false} />
              </View>

              {/* Log out */}
              <TouchableOpacity
                style={[styles.logoutBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setLogoutModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.text} />
                <Text style={[styles.logoutText, { color: colors.text }]}>Log Out</Text>
              </TouchableOpacity>

              {/* Delete account */}
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => setDeleteModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={brand.criticalDanger} />
                <Text style={styles.deleteBtnText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          )}
          </Animated.View>
        </ScrollView>

        {/* Sticky Save bar — always above the bottom tab bar, never scrolls away */}
        {activeTab === "settings" && (
          <View style={[styles.saveFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            {saveFailure ? (
              <Text style={[styles.saveFailureText, { color: colors.danger }]}>{saveFailure}</Text>
            ) : saveSuccess ? (
              <View style={styles.saveSuccessRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.saveSuccessText, { color: colors.success }]}>Saved</Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={requestSave}
              disabled={!hasChanges || saving}
              style={[styles.saveBtn, { backgroundColor: !hasChanges && !saving ? colors.border : colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={saving ? "Saving changes" : !hasChanges ? "Save changes, no changes to save" : "Save changes"}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={!hasChanges ? colors.secondaryText : "#fff"}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={[styles.saveBtnText, !hasChanges && !saving && { color: colors.secondaryText }]}>
                {saving ? "Saving..." : "Save Changes"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Save confirm */}
      <ConfirmModal
        visible={saveModalVisible}
        title={ageError ? "Cannot Save" : "Save Changes?"}
        message={ageError || "Your profile will be updated."}
        confirmLabel={ageError ? "OK" : "Save"}
        cancelLabel={ageError ? undefined : "Cancel"}
        dangerous={false}
        onConfirm={handleConfirmSave}
        onCancel={() => setSaveModalVisible(false)}
      />

      {/* Discard unsaved Settings changes when switching away */}
      <ConfirmModal
        visible={discardConfirmVisible}
        title="Discard changes?"
        message="You have unsaved profile changes. Leave without saving?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        dangerous
        onConfirm={handleDiscardChanges}
        onCancel={() => {
          setDiscardConfirmVisible(false);
          setPendingTabSwitch(null);
        }}
      />

      {/* Log out confirm */}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Log Out?"
        message="You'll need to sign in again to access your account."
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        dangerous={false}
        onConfirm={async () => { setLogoutModalVisible(false); await signOut(); }}
        onCancel={() => setLogoutModalVisible(false)}
      />

      {/* Delete account 2-step modal */}
      <DeleteAccountModal
        visible={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        onConfirm={async (password: string) => {
          await deleteAccount(password);
          // On success, auth state change redirects to onboarding automatically
        }}
        colors={colors}
      />

      <HobbiesShowAllModal
        visible={hobbiesModalVisible}
        onClose={() => setHobbiesModalVisible(false)}
        hobbies={draft.hobbies}
        colors={colors}
      />

      <StreakInfoModal
        visible={streakModalVisible}
        onClose={() => setStreakModalVisible(false)}
        colors={colors}
      />

      {/* Remove profile photo confirm */}
      <ConfirmModal
        visible={removeAvatarConfirmVisible}
        title="Remove profile photo?"
        message="Your avatar will go back to your username initial."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        dangerous
        onConfirm={handleRemoveAvatarConfirmed}
        onCancel={() => setRemoveAvatarConfirmVisible(false)}
      />

      <UserCardSheet uid={cardUid} colors={colors} onClose={() => setCardUid(null)} />

      <AchievementDetailSheet
        achievementId={selectedAchievementId}
        onClose={() => setSelectedAchievementId(null)}
        colors={colors}
        unlockedAchievements={achievements}
        currentStats={{ totalSessions, totalMinutes, currentStreak }}
      />
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },

  // Tab selector
  tabSelector: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillText: { fontSize: 14, fontWeight: "700" },

  // Overview tab
  overviewContent: { padding: 16, paddingTop: 8, gap: 20 },
  friendsAnchor: { borderRadius: 18 },
  friendsHighlight: { borderRadius: 18, borderWidth: 2 },
  sectionCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  aboutText: { fontSize: 14, lineHeight: 20 },
  showAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  showAllText: { fontSize: 13, fontWeight: "700" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Posts tab
  postsSectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  postsEmpty: { padding: 28, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 10 },
  postsEmptyText: { fontSize: 14, textAlign: "center" },
  postsCreateBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  postsCreateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Badges tab
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  sectionSub: { fontSize: 13, marginBottom: 14 },
  achieveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  achieveTile: {
    width: "47%",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  achieveTitle: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  achieveDesc: { fontSize: 11, textAlign: "center" },
  achieveDate: { fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 },

  featuredGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  featuredChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: "100%",
  },
  featuredChipText: { fontSize: 13, fontWeight: "600" },

  // Settings — 8.1 Profile Details card
  cardTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  photoAvatarWrap: { position: "relative" },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: { fontSize: 15, fontWeight: "700" },
  photoActionsRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 },
  photoActionText: { fontSize: 13, fontWeight: "700" },
  avatarErrorText: { fontSize: 12 },
  fieldDivider: { height: 1 },

  // Settings — shared card
  settingsCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },

  // SettingsField
  fieldGroup: { gap: 6 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldLabelText: { fontSize: 13, fontWeight: "600" },
  fieldInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 46,
  },
  fieldInputMultiline: { minHeight: 90, maxHeight: 160, paddingTop: 12 },
  fieldFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldError: { fontSize: 12, flex: 1 },
  fieldCounter: { fontSize: 11 },

  // Settings — Save footer
  saveFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  saveSuccessRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  saveSuccessText: { fontSize: 13, fontWeight: "600" },
  saveFailureText: { fontSize: 13, textAlign: "center" },

  // Settings — toggles / action rows
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 15, fontWeight: "600" },
  toggleSub: { fontSize: 12, marginTop: 2 },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  infoLabel: { fontSize: 14, width: 70 },
  infoValue: { fontSize: 14, fontWeight: "600", flex: 1, flexShrink: 1, textAlign: "right" },
  infoDivider: { height: 1, marginLeft: 14 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionRowLabel: { fontSize: 15, fontWeight: "600" },
  actionRowSub: { fontSize: 12, marginTop: 2 },

  // Log out / Delete
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: { fontSize: 16, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  deleteBtnText: { color: brand.criticalDanger, fontSize: 14, fontWeight: "600" },

  // Delete account modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  deleteModal: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    gap: 12,
  },
  deleteTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 4 },
  deleteBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  deleteHint: { fontSize: 13, marginTop: 4 },
  deleteInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
  },
  deleteActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  deleteCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteCancelText: { fontSize: 15, fontWeight: "600" },
  deleteConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
