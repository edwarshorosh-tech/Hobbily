import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import { useProgress } from "../../context/ProgressContext";
import { useTime } from "../../context/TimeContext";
import { useAuth } from "../../context/AuthContext";
import { usePosts } from "../../context/PostsContext";
import InputField from "../../components/InputField";
import TagChip from "../../components/TagChip";
import ConfirmModal from "../../components/ConfirmModal";
import PostCard from "../../components/PostCard";
import SwipeableTab from "../../components/SwipeableTab";
import { TIP_KEYS, useTipsReset } from "../../components/TipBanner";
import { Achievement } from "../../types/Progress";

// ── Achievement definitions (mirrors ProgressContext) ─────────────────────────
const ALL_ACHIEVEMENT_DEFS = [
  { id: "first_session",  title: "First Step",     description: "Complete your first session",    icon: "footsteps-outline" },
  { id: "streak_3",       title: "3-Day Streak",   description: "Practice 3 days in a row",       icon: "flame-outline" },
  { id: "streak_7",       title: "Week Warrior",   description: "7-day streak!",                  icon: "trophy-outline" },
  { id: "sessions_10",    title: "Dedicated",      description: "Complete 10 sessions",           icon: "star-outline" },
  { id: "minutes_300",    title: "Five Hours",     description: "5+ hours of practice total",     icon: "time-outline" },
  { id: "streak_30",      title: "Month Master",   description: "30-day streak!",                 icon: "medal-outline" },
  { id: "sessions_50",    title: "Committed",      description: "Complete 50 sessions",           icon: "ribbon-outline" },
];

// ── AchievementTile ───────────────────────────────────────────────────────────
function AchievementTile({
  def,
  earned,
  colors,
}: {
  def: typeof ALL_ACHIEVEMENT_DEFS[0];
  earned: Achievement | undefined;
  colors: any;
}) {
  return (
    <View
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
    </View>
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
        <View style={[styles.deleteModal, { backgroundColor: colors.card, borderColor: "#ef4444" }]}>
          <Ionicons name="warning-outline" size={36} color="#ef4444" style={{ alignSelf: "center" }} />
          <Text style={[styles.deleteTitle, { color: colors.text }]}>Delete Account</Text>
          <Text style={[styles.deleteBody, { color: colors.secondaryText }]}>
            This will permanently delete your profile, progress, and all your data. This cannot be undone.
          </Text>

          {/* Step 1: checkbox */}
          <TouchableOpacity style={styles.checkRow} onPress={() => setChecked(!checked)} activeOpacity={0.7}>
            <View style={[styles.checkbox, { borderColor: "#ef4444", backgroundColor: checked ? "#ef4444" : "transparent" }]}>
              {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkLabel, { color: colors.text }]}>
              I understand this is permanent and cannot be undone.
            </Text>
          </TouchableOpacity>

          {/* Step 2: type DELETE */}
          <Text style={[styles.deleteHint, { color: colors.secondaryText }]}>
            Type <Text style={{ color: "#ef4444", fontWeight: "700" }}>DELETE</Text> to confirm:
          </Text>
          <TextInput
            style={[styles.deleteInput, { color: colors.text, borderColor: confirmText === "DELETE" ? "#ef4444" : colors.border, backgroundColor: colors.inputBackground }]}
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
            <Text style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>{error}</Text>
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
              style={[styles.deleteConfirmBtn, { backgroundColor: canDelete ? "#ef4444" : colors.border }]}
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
/** A single icon + label + value row, used inside a bordered info card. */
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
        <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {divider && <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
type TabId = "overview" | "posts" | "badges" | "settings";

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { profile, saveProfile } = useProfile();
  const { achievements } = useProgress();
  const { dailyReminderEnabled, setDailyReminderEnabled, resetDailyBanner } = useTime();
  const { signOut, deleteAccount } = useAuth();
  const { posts, deletePost } = usePosts();
  const { bump: bumpTips } = useTipsReset();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [draft, setDraft] = useState({ ...profile });
  const [newTag, setNewTag] = useState("");
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [tipsResetDone, setTipsResetDone] = useState(false);

  const initials = (draft.username || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function addHobby() {
    const tag = newTag.trim();
    if (!tag) return;
    if (draft.hobbies.includes(tag)) {
      setSaveError(`"${tag}" is already in your hobbies.`);
      setSaveModalVisible(true);
      return;
    }
    setDraft({ ...draft, hobbies: [...draft.hobbies, tag] });
    setNewTag("");
    setPendingTag(null);
  }

  function handleTagPress(tag: string) {
    if (pendingTag === tag) {
      setDraft({ ...draft, hobbies: draft.hobbies.filter((t) => t !== tag) });
      setPendingTag(null);
    } else {
      setPendingTag(tag);
    }
  }

  function requestSave() {
    const ageNum = parseInt(draft.age, 10);
    if (draft.age && (isNaN(ageNum) || ageNum < 13 || ageNum > 150)) {
      setSaveError("Age must be between 13 and 150.");
      setSaveModalVisible(true);
      return;
    }
    setSaveError("");
    setSaveModalVisible(true);
  }

  async function handleConfirmSave() {
    setSaveModalVisible(false);
    if (saveError || saving) return;
    setSaving(true);
    try {
      await saveProfile(draft);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
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

  const myPosts = posts.filter((p) => p.username === profile.username);

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "posts", label: "Posts" },
    { id: "badges", label: "Badges" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <SwipeableTab tabIndex={4} backgroundColor={colors.background}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <Image
            source={require("../../assets/images/Hobbily_Logo.png")}
            style={styles.headerLogo}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Compact identity card */}
          <View style={[styles.identityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.identityTop}>
              <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
              <View style={styles.identityInfo}>
                <Text style={[styles.identityName, { color: colors.text }]} numberOfLines={1}>
                  {draft.username || "Your Name"}
                </Text>
                <View style={styles.identityMetaRow}>
                  {draft.city ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={13} color={colors.secondaryText} />
                      <Text style={[styles.metaText, { color: colors.secondaryText }]}>{draft.city}</Text>
                    </View>
                  ) : null}
                  {draft.age ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={13} color={colors.secondaryText} />
                      <Text style={[styles.metaText, { color: colors.secondaryText }]}>{draft.age} yrs</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <Text style={[styles.identityBio, { color: colors.secondaryText }]} numberOfLines={2}>
              {draft.bio ? draft.bio : "No bio added yet."}
            </Text>
          </View>

          {/* Tab selector */}
          <View style={[styles.tabSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tabPill,
                  activeTab === t.id && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab(t.id)}
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

          {/* ── Overview tab ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <View style={styles.overviewContent}>
              {/* About Me */}
              <View style={styles.overviewSection}>
                <Text style={[styles.overviewSectionTitle, { color: colors.text }]}>About Me</Text>
                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text
                    style={[
                      styles.aboutText,
                      { color: draft.bio ? colors.text : colors.secondaryText },
                    ]}
                  >
                    {draft.bio ? draft.bio : "No bio added yet."}
                  </Text>
                </View>
              </View>

              {/* Basic information */}
              <View style={styles.overviewSection}>
                <Text style={[styles.overviewSectionTitle, { color: colors.text }]}>Basic Information</Text>
                <View style={[styles.sectionCard, styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <InfoRow icon="calendar-outline" label="Age" value={draft.age || "Not set"} colors={colors} />
                  <InfoRow icon="location-outline" label="City" value={draft.city || "Not set"} colors={colors} divider={false} />
                </View>
              </View>

              {/* My Hobbies */}
              <View style={styles.overviewSection}>
                <Text style={[styles.overviewSectionTitle, { color: colors.text }]}>My Hobbies</Text>
                {draft.hobbies.length > 0 ? (
                  <View style={styles.tagWrap}>
                    {draft.hobbies.map((tag) => (
                      <TagChip
                        key={tag}
                        label={tag}
                        textColor="#fff"
                        backgroundColor={colors.primary}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.aboutText, { color: colors.secondaryText }]}>
                      No hobbies added yet.
                    </Text>
                  </View>
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
              {myPosts.length === 0 ? (
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
                myPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    colors={colors}
                    onEdit={() => router.push(`/edit-post/${post.id}` as any)}
                    onDelete={() => deletePost(post.id)}
                  />
                ))
              )}
            </View>
          )}

          {/* ── Badges tab ───────────────────────────────────────────────── */}
          {activeTab === "badges" && (
            <View style={{ padding: 16, paddingTop: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Achievements</Text>
              <Text style={[styles.sectionSub, { color: colors.secondaryText }]}>
                {achievements.length} / {ALL_ACHIEVEMENT_DEFS.length} earned
              </Text>
              <View style={styles.achieveGrid}>
                {ALL_ACHIEVEMENT_DEFS.map((def) => {
                  const earned = achievements.find((a) => a.id === def.id);
                  return (
                    <AchievementTile key={def.id} def={def} earned={earned} colors={colors} />
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Settings tab ─────────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <Pressable onPress={() => setPendingTag(null)} style={{ padding: 16, paddingTop: 8 }}>
              {/* Edit profile form */}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Edit Profile</Text>
              <InputField
                label="Username"
                value={draft.username}
                onChangeText={(username) => setDraft({ ...draft, username })}
                containerStyle={{ backgroundColor: "transparent" }}
                labelStyle={{ color: colors.text }}
                inputStyle={{ color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }}
              />
              <InputField
                label="Age"
                value={draft.age}
                onChangeText={(age) => setDraft({ ...draft, age })}
                containerStyle={{ backgroundColor: "transparent" }}
                labelStyle={{ color: colors.text }}
                inputStyle={{ color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }}
                keyboardType="number-pad"
              />
              <InputField
                label="City"
                value={draft.city}
                onChangeText={(city) => setDraft({ ...draft, city })}
                containerStyle={{ backgroundColor: "transparent" }}
                labelStyle={{ color: colors.text }}
                inputStyle={{ color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }}
              />
              <InputField
                label="About Me"
                value={draft.bio}
                onChangeText={(bio) => setDraft({ ...draft, bio })}
                containerStyle={{ backgroundColor: "transparent" }}
                labelStyle={{ color: colors.text }}
                inputStyle={{ color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }}
                multiline
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 4 }]}>My Hobbies</Text>
              <View style={[styles.hobbyInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.hobbyInput, { color: colors.text }]}
                  placeholder="Add a hobby..."
                  placeholderTextColor={colors.secondaryText}
                  value={newTag}
                  onChangeText={setNewTag}
                  onSubmitEditing={addHobby}
                />
                <TouchableOpacity
                  onPress={addHobby}
                  style={[styles.addHobbyBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {draft.hobbies.length > 0 ? (
                <>
                  <Text style={[styles.hint, { color: colors.secondaryText }]}>
                    Tap a hobby to select it, tap again to remove it.
                  </Text>
                  <View style={styles.tagWrap}>
                    {draft.hobbies.map((tag) => (
                      <TagChip
                        key={tag}
                        label={tag}
                        textColor="#fff"
                        backgroundColor={colors.primary}
                        isPendingDelete={pendingTag === tag}
                        onPress={() => handleTagPress(tag)}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <Text style={[styles.hint, { color: colors.secondaryText }]}>
                  No hobbies added yet — add some above!
                </Text>
              )}

              <TouchableOpacity
                onPress={requestSave}
                disabled={saving}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save Changes"}</Text>
              </TouchableOpacity>
              {saveSuccess && (
                <View style={styles.saveSuccessRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[styles.saveSuccessText, { color: colors.success }]}>Saved</Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Appearance</Text>
              <ToggleRow
                label="Dark Mode"
                sublabel={isDark ? "Currently dark" : "Currently light"}
                value={isDark}
                onToggle={toggleTheme}
                colors={colors}
              />

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Notifications</Text>
              <ToggleRow
                label="Daily Practice Reminder"
                sublabel="Get a reminder to practice each day"
                value={dailyReminderEnabled}
                onToggle={() => setDailyReminderEnabled(!dailyReminderEnabled)}
                colors={colors}
              />

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Tips & Hints</Text>
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

              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Account</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <InfoRow icon="mail-outline" label="Email" value={profile.email || "Not set"} colors={colors} />
                <InfoRow icon="person-outline" label="Username" value={profile.username || "Not set"} colors={colors} />
                <InfoRow icon="location-outline" label="City" value={profile.city || "Not set"} colors={colors} divider={false} />
              </View>

              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
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
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteBtnText}>Delete Account</Text>
              </TouchableOpacity>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Save confirm */}
      <ConfirmModal
        visible={saveModalVisible}
        title={saveError ? "Cannot Save" : "Save Changes?"}
        message={saveError || "Your profile will be updated."}
        confirmLabel={saveError ? "OK" : "Save"}
        cancelLabel={saveError ? undefined : "Cancel"}
        dangerous={false}
        onConfirm={handleConfirmSave}
        onCancel={() => setSaveModalVisible(false)}
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
  headerLogo: { width: 36, height: 36, resizeMode: "contain" },

  // Compact identity card
  identityCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  identityTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 22, fontWeight: "800" },
  identityInfo: { flex: 1, gap: 4 },
  identityName: { fontSize: 19, fontWeight: "800" },
  identityMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 13 },
  identityBio: { fontSize: 13, lineHeight: 18 },

  // Tab selector
  tabSelector: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillText: { fontSize: 14, fontWeight: "700" },

  // Overview tab
  overviewContent: { padding: 16, paddingTop: 8, gap: 24 },
  overviewSection: { gap: 12 },
  overviewSectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  aboutText: { fontSize: 14, lineHeight: 20 },

  // Shared edit form
  label: { fontWeight: "700", fontSize: 15, marginBottom: 8 },
  hobbyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: 8,
  },
  hobbyInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  addHobbyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  hint: { fontSize: 12, marginBottom: 8, fontStyle: "italic" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  saveSuccessRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
  saveSuccessText: { fontSize: 13, fontWeight: "600" },

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

  // Settings tab
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
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  infoLabel: { fontSize: 14, width: 70 },
  infoValue: { fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
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
    marginTop: 20,
  },
  logoutText: { fontSize: 16, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  deleteBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "600" },

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
