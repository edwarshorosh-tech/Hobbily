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
import { ScrollView, Text, TextInput, StyleSheet, View, Pressable } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { usePosts } from "../../context/PostsContext";
import { useProfile } from "../../context/ProfileContext";
import PrimaryButton from "../../components/PrimaryButton";
import TagChip from "../../components/TagChip";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditPost() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, editPost } = usePosts();
  const { profile } = useProfile();

  // Look up the post to pre-fill the form
  const found = posts.find((p) => p.id === id);
  // Only the post's own author may edit it — treat someone else's post as not found
  const existing = found?.username === profile.username ? found : undefined;

  // State initialised from the existing post (or empty fallbacks for safety)
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [newTag, setNewTag] = useState("");

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

  /** Validates inputs, persists the edit (sets editedAt), then goes back */
  async function handleSave() {
    if (!title.trim() || !body.trim()) return;
    await editPost(id!, title.trim(), body.trim(), tags);
    router.back();
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
            label="Save Changes"
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
  actionRow: { flexDirection: "row", gap: 12 },
});
