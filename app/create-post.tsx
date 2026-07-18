/**
 * Create Post screen — a friendly post composer.
 * Same createPost() Firestore write (via PostsContext) as before; only the
 * UI changed. Related hobbies reuse the same HobbiesEditor component as
 * Settings (search/add, selected chips with a visible remove icon, suggested
 * chips) instead of the old two-press delete pattern.
 */
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useProfile } from "../context/ProfileContext";
import { usePosts } from "../context/PostsContext";
import ConfirmModal from "../components/ConfirmModal";
import HobbiesEditor from "../components/settings/HobbiesEditor";

const TITLE_MAX = 100;
const BODY_MAX = 1000;

export default function CreatePost() {
  const { colors } = useTheme();
  const { profile } = useProfile();
  const { createPost } = usePosts();
  const navigation = useNavigation();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

  const justPublishedRef = useRef(false);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);

  const hasContent = title.trim().length > 0 || body.trim().length > 0 || tags.length > 0;
  const canPublish = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  // Intercept both the top-bar close button (via router.back()) and Android
  // hardware back — both route through this same navigator "remove" event.
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (justPublishedRef.current || !hasContent) return;
      e.preventDefault();
      pendingLeaveActionRef.current = () => navigation.dispatch(e.data.action);
      setDiscardConfirmVisible(true);
    });
    return unsub;
  }, [navigation, hasContent]);

  const initials = (profile.username || "?").trim().charAt(0).toUpperCase() || "?";

  async function handleSubmit() {
    setAttemptedSubmit(true);
    if (!canPublish) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createPost(title.trim(), body.trim(), tags);
      justPublishedRef.current = true;
      router.back();
    } catch (e) {
      if (__DEV__) console.warn("[CreatePost] publish failed", e);
      setSubmitError("Couldn't publish your post. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.topBarBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Create Post</Text>
        <View style={styles.topBarBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                {profile.username || "You"}
              </Text>
              <Text style={[styles.authorSub, { color: colors.secondaryText }]}>Share your progress</Text>
            </View>
          </View>

          {/* Composer card — title + body feel like one connected surface */}
          <View style={[styles.composerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you working on?"
              placeholderTextColor={colors.secondaryText}
              maxLength={TITLE_MAX}
              style={[styles.titleInput, { color: colors.text }]}
            />
            <View style={styles.counterRow}>
              {attemptedSubmit && !title.trim() ? (
                <Text style={[styles.errorText, { color: colors.danger }]}>Add a title for your post.</Text>
              ) : (
                <View />
              )}
              <Text style={[styles.counterText, { color: colors.secondaryText }]}>
                {title.length}/{TITLE_MAX}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Share what you practiced, learned, or achieved…"
              placeholderTextColor={colors.secondaryText}
              maxLength={BODY_MAX}
              multiline
              textAlignVertical="top"
              style={[styles.bodyInput, { color: colors.text }]}
            />
            <View style={styles.counterRow}>
              {attemptedSubmit && !body.trim() ? (
                <Text style={[styles.errorText, { color: colors.danger }]}>Write something in the body.</Text>
              ) : (
                <View />
              )}
              <Text style={[styles.counterText, { color: colors.secondaryText }]}>
                {body.length}/{BODY_MAX}
              </Text>
            </View>
          </View>

          {/* Related hobbies */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <HobbiesEditor
              hobbies={tags}
              onChange={setTags}
              colors={colors}
              disabled={submitting}
              title="Related hobbies"
            />
          </View>

          {submitError ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.danger + "18", borderColor: colors.danger }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.errorBannerText, { color: colors.danger }]}>{submitError}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Publish */}
      <View style={[styles.publishFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canPublish}
          style={[styles.publishBtn, { backgroundColor: colors.primary, opacity: canPublish ? 1 : 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={submitting ? "Publishing" : "Publish"}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 6 }} />
          ) : (
            <Ionicons name="paper-plane-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
          )}
          <Text style={styles.publishBtnText}>{submitting ? "Publishing..." : "Publish"}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={discardConfirmVisible}
        title="Discard post?"
        message="You have unsaved changes. Leave without publishing?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        dangerous
        onConfirm={() => {
          setDiscardConfirmVisible(false);
          pendingLeaveActionRef.current?.();
        }}
        onCancel={() => setDiscardConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topBarTitle: { fontSize: 17, fontWeight: "800" },
  scrollContent: { padding: 16, paddingBottom: 24, gap: 16 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  authorName: { fontSize: 15, fontWeight: "700" },
  authorSub: { fontSize: 12, marginTop: 1 },
  composerCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  titleInput: { fontSize: 17, fontWeight: "700", paddingVertical: 6 },
  bodyInput: { fontSize: 14, lineHeight: 20, minHeight: 110, maxHeight: 260, paddingVertical: 6 },
  divider: { height: 1, marginVertical: 8 },
  counterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  errorText: { fontSize: 12, flex: 1 },
  counterText: { fontSize: 11 },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 14 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  publishFooter: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1 },
  publishBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14 },
  publishBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
