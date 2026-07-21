/**
 * FriendSearchModal — the "Add Friend" bottom sheet opened from FriendsSection's
 * plus button. Two panes: Find Friends (exact username search) and Requests
 * (incoming/outgoing). Uses the shared BottomSheet shell (backdrop, handle,
 * swipe-to-dismiss, safe-area padding) instead of its own Modal/Animated copy
 * — previously this duplicated that whole shell by hand, which meant a fix to
 * the shared handle/gesture (see BottomSheet.tsx/useSwipeToCloseSheet.ts)
 * would silently not apply here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ColorTokens } from "../../context/ThemeContext";
import { friendlyMessage, FriendRequestViewModel, useFriends } from "../../context/FriendsContext";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";
import { FriendRelationshipStatus, FriendSearchResult, fetchFriendRecommendations } from "../../services/friendsService";
import { PublicProfile } from "../../types/PublicProfile";
import BottomSheet from "../BottomSheet";
import FriendAvatar from "./FriendAvatar";
import UserCardSheet from "../user-card/UserCardSheet";

type Tab = "find" | "requests";

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ColorTokens;
  /** Which pane to show when the modal opens — defaults to "find". */
  initialTab?: Tab;
};

type SearchState = "idle" | "searching" | "found" | "not_found" | "error";

// ── Search result preview card ──────────────────────────────────────────────

function relationshipAction(relationship: FriendRelationshipStatus): {
  label: string;
  kind: "add" | "requested" | "accept" | "friends" | "you";
} {
  switch (relationship) {
    case "self":
      return { label: "You", kind: "you" };
    case "friends":
      return { label: "Friends", kind: "friends" };
    case "outgoing_pending":
      return { label: "Requested", kind: "requested" };
    case "incoming_pending":
      return { label: "Accept", kind: "accept" };
    default:
      return { label: "Add Friend", kind: "add" };
  }
}

function SearchResultCard({
  result,
  colors,
  onResultChange,
  onOpenCard,
}: {
  result: FriendSearchResult;
  colors: ColorTokens;
  onResultChange: (next: FriendSearchResult) => void;
  onOpenCard: (uid: string) => void;
}) {
  const { sendRequest, acceptRequest, actionState } = useFriends();
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSentFeedback, setShowSentFeedback] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [result.profile.uid, fade]);

  const { label, kind } = relationshipAction(result.relationship);
  const displayName = result.profile.username || "User";
  const sendKey = `send:${result.profile.uid}`;
  const acceptKey = result.friendshipId ? `accept:${result.friendshipId}` : "";
  const loading = actionState[sendKey] === "loading" || Boolean(acceptKey && actionState[acceptKey] === "loading");

  async function handlePress() {
    if (loading) return;
    setLocalError(null);
    if (kind === "add") {
      const res = await sendRequest(result.profile.uid);
      if (res.ok) {
        onResultChange({ ...result, relationship: "outgoing_pending" });
        setShowSentFeedback(true);
        setTimeout(() => setShowSentFeedback(false), 2000);
      } else {
        setLocalError(res.message);
      }
    } else if (kind === "accept" && result.friendshipId) {
      const res = await acceptRequest(result.friendshipId);
      if (res.ok) {
        onResultChange({ ...result, relationship: "friends" });
      } else {
        setLocalError(res.message);
      }
    }
  }

  const disabled = kind === "requested" || kind === "friends" || kind === "you" || loading;

  return (
    <Animated.View
      style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: fade }]}
    >
      <TouchableOpacity
        style={styles.resultIdentity}
        onPress={() => onOpenCard(result.profile.uid)}
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName}'s profile`}
      >
        <FriendAvatar username={displayName} avatarUrl={result.profile.avatarUrl} size={44} colors={colors} />
        <View style={styles.resultInfo}>
          <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          {result.profile.city ? (
            <Text style={[styles.resultCity, { color: colors.secondaryText }]} numberOfLines={1}>
              {result.profile.city}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        style={[
          styles.resultAction,
          kind === "add" || kind === "accept"
            ? { backgroundColor: colors.primary }
            : { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          kind === "add"
            ? `Send friend request to ${displayName}`
            : kind === "accept"
            ? `Accept friend request from ${displayName}`
            : label
        }
      >
        {loading ? (
          <ActivityIndicator size="small" color={kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText} />
        ) : (
          <Text
            style={[
              styles.resultActionText,
              { color: kind === "add" || kind === "accept" ? "#fff" : colors.secondaryText },
            ]}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
      {localError ? <Text style={[styles.resultError, { color: colors.danger }]}>{localError}</Text> : null}
      {showSentFeedback ? (
        <Text style={[styles.resultSuccess, { color: colors.success }]}>Request sent</Text>
      ) : null}
    </Animated.View>
  );
}

// ── People you may know ──────────────────────────────────────────────────────
// Shown under the search box only while it's empty — search takes over once
// the user starts typing, rather than the two competing for the same space.

function RecommendationRow({
  profile,
  colors,
  onOpenCard,
  onSent,
}: {
  profile: PublicProfile;
  colors: ColorTokens;
  onOpenCard: (uid: string) => void;
  onSent: (uid: string) => void;
}) {
  const { sendRequest, actionState } = useFriends();
  const [localError, setLocalError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const sendKey = `send:${profile.uid}`;
  const loading = actionState[sendKey] === "loading";

  async function handleAdd() {
    if (loading || sent) return;
    setLocalError(null);
    const res = await sendRequest(profile.uid);
    if (res.ok) {
      setSent(true);
      onSent(profile.uid);
    } else {
      setLocalError(res.message);
    }
  }

  return (
    <View style={[styles.recRow, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.requestIdentity}
        onPress={() => onOpenCard(profile.uid)}
        accessibilityRole="button"
        accessibilityLabel={`View ${profile.username || "User"}'s profile`}
      >
        <FriendAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={40} colors={colors} />
        <View style={styles.requestInfo}>
          <Text style={[styles.requestName, { color: colors.text }]} numberOfLines={1}>
            {profile.username || "User"}
          </Text>
          {profile.city ? (
            <Text style={[styles.requestCity, { color: colors.secondaryText }]} numberOfLines={1}>
              {profile.city}
            </Text>
          ) : null}
          {profile.hobbies.length > 0 ? (
            <Text style={[styles.recHobbies, { color: colors.secondaryText }]} numberOfLines={1}>
              {profile.hobbies.slice(0, 3).join(" · ")}
            </Text>
          ) : null}
          {localError ? <Text style={[styles.resultError, { color: colors.danger }]}>{localError}</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleAdd}
        disabled={loading || sent}
        style={[
          styles.resultAction,
          sent ? { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border } : { backgroundColor: colors.primary },
          { minWidth: 0, paddingHorizontal: 12 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={sent ? "Request sent" : `Send friend request to ${profile.username || "User"}`}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={[styles.resultActionText, { color: sent ? colors.secondaryText : "#fff" }]}>
            {sent ? "Sent" : "Add"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function PeopleYouMayKnow({ colors, onOpenCard }: { colors: ColorTokens; onOpenCard: (uid: string) => void }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { acceptedFriends, incomingRequests, outgoingRequests } = useFriends();
  const [recs, setRecs] = useState<PublicProfile[] | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [sentUids, setSentUids] = useState<Set<string>>(new Set());

  const excludeKey = [
    user?.uid,
    ...acceptedFriends.map((p) => p.uid),
    ...incomingRequests.map((r) => r.otherUid),
    ...outgoingRequests.map((r) => r.otherUid),
  ].sort().join(",");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const excludeUids = new Set<string>([
      user.uid,
      ...acceptedFriends.map((p) => p.uid),
      ...incomingRequests.map((r) => r.otherUid),
      ...outgoingRequests.map((r) => r.otherUid),
    ]);
    fetchFriendRecommendations(user.uid, excludeUids, profile.hobbies, profile.city)
      .then((list) => { if (!cancelled) setRecs(list); })
      .catch((e) => { if (!cancelled) setRecError(friendlyMessage(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, excludeKey]);

  if (!user) return null;
  const visibleRecs = (recs ?? []).filter((p) => !sentUids.has(p.uid));

  return (
    <View style={styles.recSection}>
      <Text style={[styles.paneSectionLabel, { color: colors.secondaryText }]}>People you may know</Text>
      {recs === null && !recError ? (
        <View style={styles.paneState}>
          <ActivityIndicator size="small" color={colors.secondaryText} />
        </View>
      ) : recError ? (
        <View style={styles.paneState}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.secondaryText} />
          <Text style={[styles.paneStateText, { color: colors.secondaryText }]}>{recError}</Text>
        </View>
      ) : visibleRecs.length === 0 ? (
        <Text style={[styles.paneStateText, { color: colors.secondaryText, textAlign: "left" }]}>
          No new people to suggest right now — check back later.
        </Text>
      ) : (
        visibleRecs.map((p) => (
          <RecommendationRow
            key={p.uid}
            profile={p}
            colors={colors}
            onOpenCard={onOpenCard}
            onSent={(uid) => setSentUids((prev) => new Set(prev).add(uid))}
          />
        ))
      )}
    </View>
  );
}

// ── Find Friends pane ────────────────────────────────────────────────────────

function FindFriendsPane({ colors, onOpenCard }: { colors: ColorTokens; onOpenCard: (uid: string) => void }) {
  const { searchUsername } = useFriends();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [result, setResult] = useState<FriendSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setState("idle");
      setError("Enter a username to search.");
      setResult(null);
      return;
    }
    setState("searching");
    setError(null);
    setResult(null);
    try {
      const found = await searchUsername(trimmed);
      if (!found) {
        setState("not_found");
      } else {
        setResult(found);
        setState("found");
      }
    } catch (e) {
      setState("error");
      setError(friendlyMessage(e));
    }
  }, [query, searchUsername]);

  function handleClear() {
    setQuery("");
    setState("idle");
    setResult(null);
    setError(null);
  }

  return (
    <View style={styles.pane}>
      <View style={[styles.searchInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.secondaryText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search username"
          placeholderTextColor={colors.secondaryText}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          accessibilityLabel="Search username"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSearch}
          disabled={state === "searching"}
          style={[styles.searchBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          {state === "searching" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {state === "not_found" && (
        <View style={styles.paneState}>
          <Ionicons name="person-outline" size={22} color={colors.secondaryText} />
          <Text style={[styles.paneStateText, { color: colors.secondaryText }]}>
            No user found with that username.
          </Text>
        </View>
      )}
      {state === "error" && error && (
        <View style={styles.paneState}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.secondaryText} />
          <Text style={[styles.paneStateText, { color: colors.secondaryText }]}>{error}</Text>
        </View>
      )}
      {state === "idle" && error && (
        <Text style={[styles.inlineHint, { color: colors.secondaryText }]}>{error}</Text>
      )}
      {state === "found" && result && (
        <SearchResultCard result={result} colors={colors} onResultChange={setResult} onOpenCard={onOpenCard} />
      )}
      {state === "idle" && query.trim() === "" && <PeopleYouMayKnow colors={colors} onOpenCard={onOpenCard} />}
    </View>
  );
}

// ── Requests pane ─────────────────────────────────────────────────────────────

function RequestRow({
  item,
  colors,
  onOpenCard,
}: {
  item: FriendRequestViewModel;
  colors: ColorTokens;
  onOpenCard: (uid: string) => void;
}) {
  const { acceptRequest, declineRequest, cancelRequest, actionState } = useFriends();
  const displayName = item.profile?.username || "User";
  const city = item.profile?.city;

  const acceptLoading = actionState[`accept:${item.friendshipId}`] === "loading";
  const declineLoading = actionState[`decline:${item.friendshipId}`] === "loading";
  const cancelLoading = actionState[`cancel:${item.friendshipId}`] === "loading";
  const [rowError, setRowError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setRowError(null);
    const res = await action();
    if (!res.ok) setRowError(res.message);
  }

  return (
    <View style={[styles.requestRow, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.requestIdentity}
        onPress={() => item.profile && onOpenCard(item.profile.uid)}
        disabled={!item.profile}
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName}'s profile`}
      >
        <FriendAvatar username={displayName} avatarUrl={item.profile?.avatarUrl} size={40} colors={colors} />
        <View style={styles.requestInfo}>
          <Text style={[styles.requestName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          {city ? (
            <Text style={[styles.requestCity, { color: colors.secondaryText }]} numberOfLines={1}>
              {city}
            </Text>
          ) : null}
          {rowError ? <Text style={[styles.resultError, { color: colors.danger }]}>{rowError}</Text> : null}
        </View>
      </TouchableOpacity>

      {item.direction === "incoming" ? (
        <View style={styles.requestActions}>
          <TouchableOpacity
            onPress={() => run(() => declineRequest(item.friendshipId))}
            disabled={acceptLoading || declineLoading}
            style={[styles.iconBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Decline friend request from ${displayName}`}
          >
            {declineLoading ? (
              <ActivityIndicator size="small" color={colors.secondaryText} />
            ) : (
              <Ionicons name="close" size={16} color={colors.secondaryText} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => run(() => acceptRequest(item.friendshipId))}
            disabled={acceptLoading || declineLoading}
            style={[styles.acceptBtn, { backgroundColor: colors.primary, opacity: acceptLoading ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Accept friend request from ${displayName}`}
          >
            {acceptLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.requestActions}>
          <Text style={[styles.pendingLabel, { color: colors.secondaryText }]}>Pending</Text>
          <TouchableOpacity
            onPress={() => run(() => cancelRequest(item.friendshipId))}
            disabled={cancelLoading}
            style={[styles.iconBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Cancel friend request to ${displayName}`}
          >
            {cancelLoading ? (
              <ActivityIndicator size="small" color={colors.secondaryText} />
            ) : (
              <Ionicons name="close" size={14} color={colors.secondaryText} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function RequestsPane({ colors, onOpenCard }: { colors: ColorTokens; onOpenCard: (uid: string) => void }) {
  const { incomingRequests, outgoingRequests } = useFriends();
  const hasAny = incomingRequests.length > 0 || outgoingRequests.length > 0;

  if (!hasAny) {
    return (
      <View style={styles.paneState}>
        <Text style={[styles.paneStateText, { color: colors.secondaryText }]}>
          No pending friend requests.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.pane} showsVerticalScrollIndicator={false}>
      {incomingRequests.length > 0 && (
        <>
          <Text style={[styles.paneSectionLabel, { color: colors.secondaryText }]}>Incoming</Text>
          {incomingRequests.map((item) => (
            <RequestRow key={item.friendshipId} item={item} colors={colors} onOpenCard={onOpenCard} />
          ))}
        </>
      )}
      {outgoingRequests.length > 0 && (
        <>
          <Text style={[styles.paneSectionLabel, { color: colors.secondaryText, marginTop: 12 }]}>Sent</Text>
          {outgoingRequests.map((item) => (
            <RequestRow key={item.friendshipId} item={item} colors={colors} onOpenCard={onOpenCard} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function FriendSearchModal({ visible, onClose, colors, initialTab = "find" }: Props) {
  const { incomingRequests } = useFriends();
  const [tab, setTab] = useState<Tab>("find");
  const [cardUid, setCardUid] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} colors={colors} avoidKeyboard maxHeight="86%">
        <View style={styles.titleRow}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Friends</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={22} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.tabPill, tab === "find" && { backgroundColor: colors.primary }]}
            onPress={() => setTab("find")}
          >
            <Text style={[styles.tabPillText, { color: tab === "find" ? "#fff" : colors.secondaryText }]}>
              Find Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, tab === "requests" && { backgroundColor: colors.primary }]}
            onPress={() => setTab("requests")}
          >
            <View style={styles.tabPillInner}>
              <Text
                style={[styles.tabPillText, { color: tab === "requests" ? "#fff" : colors.secondaryText }]}
              >
                Requests
              </Text>
              {incomingRequests.length > 0 && (
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: tab === "requests" ? "#fff" : "#EF4444" },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      { color: tab === "requests" ? colors.primary : "#fff" },
                    ]}
                  >
                    {incomingRequests.length > 9 ? "9+" : incomingRequests.length}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {tab === "find" ? (
          <FindFriendsPane colors={colors} onOpenCard={setCardUid} />
        ) : (
          <RequestsPane colors={colors} onOpenCard={setCardUid} />
        )}
      </BottomSheet>

      <UserCardSheet uid={cardUid} colors={colors} onClose={() => setCardUid(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2, marginBottom: 12 },
  sheetTitle: { fontSize: 19, fontWeight: "800" },
  closeIconBtn: { padding: 2 },
  tabRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 14 },
  tabPill: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabPillInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  tabPillText: { fontSize: 13, fontWeight: "700" },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  tabBadgeText: { fontSize: 10, fontWeight: "800" },

  pane: { minHeight: 120, paddingBottom: 12 },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  searchBtn: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  paneState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 24 },
  paneStateText: { fontSize: 13, textAlign: "center" },
  inlineHint: { fontSize: 12, marginTop: 8 },
  paneSectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },

  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    gap: 10,
    flexWrap: "wrap",
  },
  resultIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 80 },
  resultInfo: { flex: 1, minWidth: 80 },
  resultName: { fontSize: 15, fontWeight: "700" },
  resultCity: { fontSize: 12, marginTop: 1 },
  resultAction: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, minWidth: 88, alignItems: "center" },
  resultActionText: { fontSize: 13, fontWeight: "700" },
  resultError: { fontSize: 11, width: "100%", marginTop: 2 },
  resultSuccess: { fontSize: 11, width: "100%", marginTop: 2, fontWeight: "600" },

  recSection: { marginTop: 18 },
  recRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  recHobbies: { fontSize: 11, marginTop: 1 },
  requestRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  requestIdentity: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
  requestInfo: { flex: 1, marginLeft: 10, minWidth: 0 },
  requestName: { fontSize: 14, fontWeight: "700" },
  requestCity: { fontSize: 12, marginTop: 1 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  acceptBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pendingLabel: { fontSize: 11, fontWeight: "600" },
});
