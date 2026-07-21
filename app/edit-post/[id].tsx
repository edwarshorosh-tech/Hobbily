/**
 * Edit Post screen
 * Pre-fills from the existing post (looked up by [id] URL param).
 * On save, updates the post in AsyncStorage via PostsContext, sets editedAt,
 * and navigates back. The "edited" badge will appear on the post card and detail view.
 *
 * Two-press tag deletion:
 *   First tap  → chip turns red (pending delete)
 *   Second tap → chip is removed
 *   Tapping a different chip → resets the pending state of the previous one
 */
import { ScrollView, Text, TextInput, StyleSheet, View, Pressable, Image } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../context/ThemeContext";
import { usePosts } from "../../context/PostsContext";
import { useAuth } from "../../context/AuthContext";
import { uploadPostImage, deletePostImage } from "../../services/storageService";
import PrimaryButton from "../../components/PrimaryButton";
import TagChip from "../../components/TagChip";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditPost() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, editPost } = usePosts();
  const { user } = useAuth();

  // Look up the post to pre-fill the form
  const found = posts.find((p) => p.id === id);
  // Only the post's own author may edit it — treat someone else's post as not found
  const existing = found && user && found.authorId === user.uid ? found : undefined;

  // State initialised from the existing post (or empty fallbacks for safety)
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [newTag, setNewTag] = useState("");
  // Holds either the existing remote URL, a freshly-picked local uri, or null if removed.
  const [imageUri, setImageUri] = useState<string | null>(existing?.imageUrl || null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Tracks which tag chip is in the "pending delete" state
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  // Guard: if the post was deleted between navigation and render, show a fallback
  if (!existing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, padding: 16 }}>Post not found.</Text>
      </SafeAreaView>
    );
  }

  // Narrowed alias for use inside the handlers below — `existing` is guaranteed
  // non-undefined past the guard above, but TS doesn't carry that narrowing
  // into nested function declarations.
  const post = existing;

  /** Adds a non-duplicate tag to the list */
  function addTag() {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    setTags([...tags, tag]);
    setNewTag("");
    setPendingTag(null);
  }

  /**
   * Two-press delete: first press marks the chip red, second press removes it.
   * Pressing a different chip resets the previously marked one.
   */
  function handleTagPress(tag: string) {
    if (pendingTag === tag) {
      setTags(tags.filter((t) => t !== tag));
      setPendingTag(null);
    } else {
      setPendingTag(tag);
    }
  }

  async function handlePickImage() {
    setImageError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setImageError("Photo access was denied. Enable it in your device settings to add a photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setImageUri(result.assets[0].uri);
    } catch (e) {
      if (__DEV__) console.warn("[EditPost] image pick failed", e);
      setImageError("Couldn't open your photo library. Please try again.");
    }
  }

  /** Validates inputs, persists the edit (sets editedAt), then goes back */
  async function handleSave() {
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    setImageError(null);
    try {
      const originalImageUrl = post.imageUrl || null;
      let imageUrl = originalImageUrl ?? "";
      if (imageUri !== originalImageUrl) {
        imageUrl = imageUri && user ? await uploadPostImage(user.uid, imageUri) : "";
        if (originalImageUrl) await deletePostImage(originalImageUrl).catch(() => {});
      }
      await editPost(id!, title.trim(), body.trim(), tags, imageUrl);
      router.back();
    } catch (e) {
      if (__DEV__) console.warn("[EditPost] save failed", e);
      setImageError("Couldn't save your changes. Please check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        {/* Clears any pending-delete tag when tapping blank space or labels */}
        <Pressable onPress={() => setPendingTag(null)}>
        <Text style={[styles.heading, { color: colors.text }]}>Edit Post</Text>

        {/* ── Post content ─────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.text }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Post title"
          placeholderTextColor={colors.secondaryText}
        />

        <Text style={[styles.label, { color: colors.text }]}>Body</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, height: 120 }]}
          multiline
          value={body}
          onChangeText={setBody}
          placeholder="Write your post..."
          placeholderTextColor={colors.secondaryText}
        />

        {/* ── Photo ────────────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.text }]}>Photo</Text>
        {imageUri ? (
          <View style={{ marginBottom: 12 }}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
            <View style={styles.photoActionRow}>
              <PrimaryButton
                label="Change Photo"
                onPress={handlePickImage}
                buttonStyle={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                textStyle={{ color: colors.text }}
              />
              <PrimaryButton
                label="Remove Photo"
                onPress={() => setImageUri(null)}
                buttonStyle={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                textStyle={{ color: colors.text }}
              />
            </View>
          </View>
        ) : (
          <PrimaryButton
            label="Add Photo"
            onPress={handlePickImage}
            buttonStyle={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
            textStyle={{ color: colors.text }}
          />
        )}
        {imageError && (
          <Text style={[styles.hint, { color: colors.danger }]}>{imageError}</Text>
        )}

        {/* ── Hobbies ──────────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.text }]}>Hobbies</Text>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={newTag}
            onChangeText={setNewTag}
            placeholder="Add a hobby"
            placeholderTextColor={colors.secondaryText}
            onSubmitEditing={addTag}
          />
          <PrimaryButton
            label="Add"
            onPress={addTag}
            buttonStyle={{ backgroundColor: colors.primary, marginLeft: 8, paddingHorizontal: 12 }}
            textStyle={{ color: colors.text }}
          />
        </View>

        {/* Hint for the two-press delete interaction */}
        <Text style={[styles.hint, { color: colors.secondaryText }]}>
          Tap a hobby once to select it for deletion, tap again to confirm.
        </Text>

        {/* Active tag chips — red = pending delete */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
          {tags.map((tag) => (
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

        {/* ── Submit / Cancel ──────────────────────────────── */}
        <View style={styles.actionRow}>
          <PrimaryButton
            label="Cancel"
            onPress={() => router.back()}
            buttonStyle={{ flex: 1, backgroundColor: colors.border }}
            textStyle={{ color: colors.text }}
          />
          <PrimaryButton
            label={saving ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            buttonStyle={{ flex: 1, backgroundColor: colors.primary }}
            textStyle={{ color: colors.text }}
          />
        </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  label: { fontWeight: "600", fontSize: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  hint: { fontSize: 12, marginBottom: 8, fontStyle: "italic" },
  imagePreview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12 },
  photoActionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionRow: { flexDirection: "row", gap: 12 },
});
