/**
 * Community screen
 * Browse hobby channels, join them, and chat with other teens who share
 * the same interests. Messages are stored in Firestore (real-time via
 * onSnapshot). The joined-channel list is persisted locally in AsyncStorage.
 */
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useCommunity } from "../../context/CommunityContext";
import { useProfile } from "../../context/ProfileContext";
import SwipeableTab from "../../components/SwipeableTab";
import TipBanner, { TIP_KEYS } from "../../components/TipBanner";
import { Channel, CommunityMessage } from "../../types/CommunityMessage";

// ── Seed messages for a better first-run experience ───────────────────────────
const SEED_MESSAGES: Record<string, { author: string; text: string }[]> = {
  photography: [
    { author: "Noa", text: "Anyone else shooting film? Just picked up a 35mm and it's amazing 📷" },
    { author: "Amir", text: "Yes! I use Kodak Gold 200 for street photography. Great tones." },
    { author: "Sara", text: "Does anyone know good spots in Tel Aviv for golden hour shots?" },
  ],
  music: [
    { author: "Yusuf", text: "Been learning oud for 3 months now. Any tips for chord transitions?" },
    { author: "Reem", text: "Practice slowly first! Speed comes on its own. Also try a metronome." },
    { author: "Daniel", text: "What genres is everyone into? I'm doing jazz guitar mostly." },
  ],
  sports: [
    { author: "Khalid", text: "Looking for people to join a 5v5 football match this Friday! 🏈" },
    { author: "Mia", text: "I'm in! Where is it?" },
    { author: "Khalid", text: "Gan HaShlosha national park, 4pm. DM for details!" },
  ],
  coding: [
    { author: "Lior", text: "Just deployed my first full-stack app. React + Node. So satisfying!" },
    { author: "Hana", text: "Nice! What did you build?" },
    { author: "Lior", text: "A habit tracker. Feel free to check out the repo — will post link soon." },
  ],
};

// ── Channel Card ──────────────────────────────────────────────────────────────

type ChannelCardProps = {
  channel: Channel;
  isJoined: boolean;
  lastMessage?: CommunityMessage;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
  onJoinToggle: () => void;
};

function ChannelCard({ channel, isJoined, lastMessage, colors, onPress, onJoinToggle }: ChannelCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.channelCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.channelIcon, { backgroundColor: colors.primary + "18" }]}>
        <Ionicons name={channel.icon as any} size={22} color={colors.primary} />
      </View>
      <View style={styles.channelInfo}>
        <View style={styles.channelTop}>
          <Text style={[styles.channelName, { color: colors.text }]}>{channel.name}</Text>
          {isJoined && (
            <View style={[styles.joinedBadge, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.joinedBadgeText, { color: colors.primary }]}>Joined</Text>
            </View>
          )}
        </View>
        {lastMessage ? (
          <Text style={[styles.channelPreview, { color: colors.secondaryText }]} numberOfLines={1}>
            <Text style={{ fontWeight: "600" }}>{lastMessage.author}: </Text>
            {lastMessage.text}
          </Text>
        ) : (
          <Text style={[styles.channelDesc, { color: colors.secondaryText }]} numberOfLines={1}>
            {channel.description}
          </Text>
        )}
        <Text style={[styles.channelMembers, { color: colors.tabBarInactive }]}>
          <Ionicons name="people-outline" size={11} /> {channel.members.toLocaleString()} members
        </Text>
      </View>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onJoinToggle(); }}
        style={[
          styles.joinBtn,
          isJoined
            ? { backgroundColor: colors.secondary, borderColor: colors.border }
            : { backgroundColor: colors.primary },
        ]}
      >
        <Text style={[styles.joinBtnText, { color: isJoined ? colors.text : "#fff" }]}>
          {isJoined ? "Leave" : "Join"}
        </Text>
      </TouchableOpacity>
    </Pressable>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

type BubbleProps = {
  msg: CommunityMessage;
  isMine: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onDelete?: () => void;
};

function MessageBubble({ msg, isMine, colors, onDelete }: BubbleProps) {
  const time = new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={[styles.bubbleWrapper, isMine && styles.bubbleWrapperMine]}>
      {!isMine && (
        <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{msg.author[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={{ maxWidth: "75%" }}>
        {!isMine && (
          <Text style={[styles.bubbleAuthor, { color: colors.secondaryText }]}>{msg.author}</Text>
        )}
        <View
          style={[
            styles.bubble,
            isMine
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.text }]}>
            {msg.text}
          </Text>
        </View>
        <View style={[styles.bubbleMeta, isMine && { justifyContent: "flex-end" }]}>
          <Text style={[styles.bubbleTime, { color: colors.tabBarInactive }]}>{time}</Text>
          {isMine && onDelete && (
            <TouchableOpacity onPress={onDelete} style={{ marginLeft: 8 }}>
              <Ionicons name="trash-outline" size={12} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Channel Chat View ─────────────────────────────────────────────────────────

type ChannelViewProps = {
  channel: Channel;
  colors: ReturnType<typeof useTheme>["colors"];
  onBack: () => void;
};

function ChannelView({ channel, colors, onBack }: ChannelViewProps) {
  const { messages, sendMessage, deleteMessage, joinedChannelIds, joinChannel } = useCommunity();
  const { profile } = useProfile();
  const [draft, setDraft] = useState("");
  const flatRef = useRef<FlatList>(null);

  const rawMessages = messages[channel.id] ?? [];
  // Combine seeded messages with real ones for a richer experience on first open
  const seedMsgs: CommunityMessage[] = (SEED_MESSAGES[channel.id] ?? []).map((s, i) => ({
    id: `seed_${i}`,
    channelId: channel.id,
    author: s.author,
    text: s.text,
    createdAt: new Date(Date.now() - (60 - i * 10) * 60000).toISOString(),
  }));
  const allMessages = rawMessages.length > 0 ? rawMessages : seedMsgs;

  const isJoined = joinedChannelIds.includes(channel.id);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    if (!isJoined) await joinChannel(channel.id);
    await sendMessage(channel.id, profile.username || "You", text);
    setDraft("");
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }

  // Scroll to bottom on first render
  useEffect(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 150);
  }, []);

  // Scroll to bottom whenever the keyboard opens so the latest message stays visible
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => sub.remove();
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Chat header */}
      <SafeAreaView edges={["top"]} style={[styles.chatHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.chatHeaderIcon, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name={channel.icon as any} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.chatHeaderTitle, { color: colors.text }]}>{channel.name}</Text>
          <Text style={[styles.chatHeaderSub, { color: colors.secondaryText }]}>
            {channel.members.toLocaleString()} members
          </Text>
        </View>
        {!isJoined && (
          <TouchableOpacity
            onPress={() => joinChannel(channel.id)}
            style={[styles.joinSmallBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Join</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      <FlatList
        ref={flatRef}
        data={allMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.chatList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item }) => (
          <MessageBubble
            msg={item}
            isMine={item.author === (profile.username || "You")}
            colors={colors}
            onDelete={
              item.id.startsWith("seed_")
                ? undefined
                : () => deleteMessage(channel.id, item.id)
            }
          />
        )}
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.chatInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder={isJoined ? "Message..." : "Join to send messages..."}
          placeholderTextColor={colors.secondaryText}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: colors.primary }, !draft.trim() && { opacity: 0.4 }]}
          disabled={!draft.trim()}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const { colors } = useTheme();
  const { channels, messages, joinedChannelIds, joinChannel, leaveChannel } = useCommunity();
  const { profile } = useProfile();

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");

  if (activeChannel) {
    return (
      <ChannelView
        channel={activeChannel}
        colors={colors}
        onBack={() => setActiveChannel(null)}
      />
    );
  }

  const displayed = channels.filter((c) => {
    if (filter === "mine" && !joinedChannelIds.includes(c.id)) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function getLastMessage(channelId: string): CommunityMessage | undefined {
    const msgs = messages[channelId];
    return msgs?.[msgs.length - 1];
  }

  return (
    <SwipeableTab tabIndex={2} backgroundColor={colors.background}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Community</Text>
          <Text style={[styles.headerSub, { color: colors.secondaryText }]}>
            Connect with teens who share your hobbies
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <TipBanner
          storageKey={TIP_KEYS.communityChannels}
          text="Join channels that match your hobbies to chat with others who share your interests!"
          icon="people-outline"
          colors={colors}
        />
        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search channels..."
              placeholderTextColor={colors.secondaryText}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Profile hobby suggestions */}
        {profile.hobbies.length > 0 && (
          <View style={styles.suggestSection}>
            <Text style={[styles.suggestLabel, { color: colors.secondaryText }]}>
              Channels matching your hobbies
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {profile.hobbies.map((hobby) => {
                const match = channels.find((c) =>
                  c.name.toLowerCase().includes(hobby.toLowerCase()) ||
                  hobby.toLowerCase().includes(c.id.toLowerCase())
                );
                if (!match) return null;
                const joined = joinedChannelIds.includes(match.id);
                return (
                  <TouchableOpacity
                    key={match.id}
                    onPress={() => setActiveChannel(match)}
                    style={[
                      styles.suggestChip,
                      { backgroundColor: joined ? colors.primary : colors.card, borderColor: joined ? colors.primary : colors.border },
                    ]}
                  >
                    <Ionicons name={match.icon as any} size={14} color={joined ? "#fff" : colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ color: joined ? "#fff" : colors.text, fontWeight: "600", fontSize: 13 }}>
                      {match.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(["all", "mine"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                filter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.filterChipText, { color: filter === f ? "#fff" : colors.secondaryText }]}>
                {f === "all" ? "All Channels" : `My Channels (${joinedChannelIds.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Channel list */}
        <View style={styles.channelList}>
          {displayed.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {filter === "mine" ? "No channels joined yet" : "No results"}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>
                {filter === "mine"
                  ? "Browse all channels and tap Join to get started."
                  : "Try a different search term."}
              </Text>
              {filter === "mine" && (
                <TouchableOpacity onPress={() => setFilter("all")} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Browse All</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayed.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                isJoined={joinedChannelIds.includes(ch.id)}
                lastMessage={getLastMessage(ch.id)}
                colors={colors}
                onPress={() => setActiveChannel(ch)}
                onJoinToggle={() =>
                  joinedChannelIds.includes(ch.id) ? leaveChannel(ch.id) : joinChannel(ch.id)
                }
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  suggestSection: { paddingHorizontal: 16, marginTop: 14 },
  suggestLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 14, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: "600" },
  channelList: { padding: 16, gap: 10 },
  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  channelIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  channelInfo: { flex: 1 },
  channelTop: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  channelName: { fontSize: 15, fontWeight: "700", marginRight: 6 },
  joinedBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  joinedBadgeText: { fontSize: 11, fontWeight: "700" },
  channelDesc: { fontSize: 13, marginBottom: 3 },
  channelPreview: { fontSize: 13, marginBottom: 3 },
  channelMembers: { fontSize: 11 },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
  },
  joinBtnText: { fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  emptyBody: { textAlign: "center", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  // Chat
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 6 },
  chatHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chatHeaderTitle: { fontSize: 16, fontWeight: "700" },
  chatHeaderSub: { fontSize: 12 },
  joinSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  chatList: { padding: 16, gap: 8 },
  bubbleWrapper: { flexDirection: "row", alignItems: "flex-end" },
  bubbleWrapperMine: { justifyContent: "flex-end" },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 18,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  bubbleAuthor: { fontSize: 11, fontWeight: "600", marginBottom: 3, marginLeft: 4 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", marginTop: 2, paddingHorizontal: 4 },
  bubbleTime: { fontSize: 10 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
