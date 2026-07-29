/**
 * Explore screen — programs, clubs, and workshops.
 * Features: save/bookmark, registration form, Open in Maps, category filters.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Linking, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import { useAuth } from "../../context/AuthContext";
import { useFriends } from "../../context/FriendsContext";
import SwipeableTab from "../../components/SwipeableTab";
import BottomSheet from "../../components/BottomSheet";
import FriendAvatar from "../../components/friends/FriendAvatar";
import { useUserProfileSheet } from "../../hooks/useUserProfileSheet";
import InlinePageDisclaimer from "../../components/disclaimers/InlinePageDisclaimer";
import UserCardSheet from "../../components/user-card/UserCardSheet";
import ConfirmModal from "../../components/ConfirmModal";
import { brand } from "../../constants/colors";
import { Opportunity, OPPORTUNITIES } from "../../constants/opportunities";
import { joinWorkshop, fetchFriendWorkshopParticipants, fetchUserWorkshops } from "../../services/workshopService";
import { useAuthorProfiles } from "../../hooks/useAuthorProfiles";
import { friendJoinedLabel } from "../../utils/friendActivityLabel";
import { withTimeout, TimeoutError } from "../../utils/withTimeout";
import { FEATURE_FLAGS } from "../../constants/featureFlags";
import { mvpRegistrationNoticeCopy } from "../../utils/mvpNotice";

/** A genuine network hang here (no response at all) must not hold the Submit button's spinner forever — see withTimeout's own doc comment. joinWorkshop's deterministic doc id makes a retry after a timeout safe (never creates a duplicate). */
const JOIN_TIMEOUT_MS = 20_000;

const CATEGORIES = ["All", "Saved", "Photography", "Coding", "Sports", "Music", "Drawing & Art", "Film & Video", "Dance", "Cooking", "Gaming", "Reading"];
const COST_COLORS: Record<string, string> = { Free: brand.costFree, Subsidised: brand.costSubsidised, Paid: brand.costPaid };

/** True if the opportunity's location text mentions the user's city (either direction, case-insensitive). */
function isNearCity(location: string, city: string): boolean {
  if (!city.trim()) return false;
  const loc = location.toLowerCase();
  const c = city.trim().toLowerCase();
  return loc.includes(c) || c.includes(loc);
}

// ── Registration Modal ────────────────────────────────────────────────────────

function RegistrationModal({
  visible,
  opp: oppProp,
  onClose,
  colors,
  onJoined,
}: {
  visible: boolean;
  opp: Opportunity | null;
  onClose: () => void;
  colors: any;
  /** Called once the real participant record has been written — lets the parent update its own "you joined" state without a full refetch. */
  onJoined: () => void;
}) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Same close-animation freeze as DetailModal — this used to be mounted/
  // unmounted directly by the parent's `{registering && selected && <.../>}`,
  // which skipped any close animation at all rather than letting
  // BottomSheet's visible={false} play it out.
  const lastOppRef = useRef<Opportunity | null>(null);
  if (oppProp) lastOppRef.current = oppProp;
  const opp = oppProp ?? lastOppRef.current;

  // This component now stays mounted across opens (see the visible prop
  // note above) instead of getting a fresh instance — and fresh useState —
  // every time. Reset the form explicitly on every real open instead, so a
  // previous submission/error never leaks into the next one. `joining` is
  // included here too: without it, a submit that never settled (a genuine
  // network hang — see withTimeout below) left the Submit button spinning
  // and permanently disabled for the rest of the session, even after the
  // sheet was closed and reopened.
  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setMessage("");
      setSubmitted(false);
      setJoinError(null);
      setJoining(false);
    }
  }, [visible]);

  if (!opp) return null;

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || joining || !user || !opp) return;
    setJoining(true);
    setJoinError(null);
    try {
      // Registering interest *is* joining the workshop — a real participant
      // record (services/workshopService.ts), not just a local "thank you"
      // screen. This is what lets friends later see "you and Lara joined".
      // Wrapped in withTimeout so a stalled connection can't hold `joining`
      // true forever — joinWorkshop's deterministic doc id (workshopId_uid)
      // makes a retry after a timeout safe, never a duplicate registration.
      await withTimeout(joinWorkshop(opp.id, user.uid, profile.username || "explorer"), JOIN_TIMEOUT_MS);
      onJoined();
      setSubmitted(true);
    } catch (e) {
      if (__DEV__) console.warn("[Opportunities] join failed", e);
      setJoinError(
        e instanceof TimeoutError
          ? e.message
          : "Couldn't submit your registration. Please check your connection and try again."
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} colors={colors} maxHeight="92%" avoidKeyboard>
          {submitted ? (
            <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Registration Sent!</Text>
              <Text style={[{ color: colors.secondaryText, textAlign: "center", fontSize: 14 }]}>
                Your interest in "{opp.name}" has been noted.{"\n"}
                {opp.contact ? `They'll reach you at ${email}.` : "Check their website for next steps."}
              </Text>
              <TouchableOpacity onPress={onClose} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>Register Interest</Text>
              <Text style={[{ color: colors.primary, fontSize: 13, fontWeight: "600", marginBottom: 16 }]}>{opp.name}</Text>
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Full Name *</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]} placeholder="Your name" placeholderTextColor={colors.secondaryText} value={name} onChangeText={setName} />
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Email *</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]} placeholder="your@email.com" placeholderTextColor={colors.secondaryText} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>Message (optional)</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, height: 80, textAlignVertical: "top" }]} placeholder="Any questions or notes..." placeholderTextColor={colors.secondaryText} value={message} onChangeText={setMessage} multiline />
              {joinError ? <Text style={{ color: colors.danger, fontSize: 12, marginBottom: 8 }}>{joinError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}>
                  <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={!name.trim() || !email.trim() || joining || !user}
                  style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2, opacity: (!name.trim() || !email.trim() || joining || !user) ? 0.4 : 1 }]}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
    </BottomSheet>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OpportunityCard({
  opp, saved, near, joined, friendProfiles, colors, onPress, onToggleSave, onPressFriends,
}: {
  opp: Opportunity; saved: boolean; near: boolean; joined: boolean;
  /** Real publicProfiles of this user's friends who joined this workshop — up to a few, resolved via useAuthorProfiles. Empty when none did. */
  friendProfiles: { uid: string; username: string; avatarUrl: string | null }[];
  colors: any; onPress: () => void; onToggleSave: () => void; onPressFriends: () => void;
}) {
  const shownFriends = friendProfiles.slice(0, 3);
  const friendOverflow = friendProfiles.length - shownFriends.length;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.82}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{opp.name}</Text>
          <Text style={[styles.cardOrg, { color: colors.secondaryText }]}>{opp.organisation}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[styles.costBadge, { backgroundColor: COST_COLORS[opp.cost] + "18" }]}>
            <Text style={[styles.costText, { color: COST_COLORS[opp.cost] }]}>{opp.cost}</Text>
          </View>
          <TouchableOpacity onPress={onToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={saved ? "heart" : "heart-outline"} size={20} color={saved ? "#EF4444" : colors.tabBarInactive} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.badgeRow}>
        {near && (
          <View style={[styles.nearBadge, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="location" size={11} color={colors.primary} style={{ marginRight: 3 }} />
            <Text style={[styles.nearBadgeText, { color: colors.primary }]}>Near you</Text>
          </View>
        )}
        {joined && (
          <View style={[styles.nearBadge, { backgroundColor: `${colors.success ?? brand.costFree}18` }]}>
            <Ionicons name="checkmark-circle" size={11} color={colors.success ?? brand.costFree} style={{ marginRight: 3 }} />
            <Text style={[styles.nearBadgeText, { color: colors.success ?? brand.costFree }]}>You joined</Text>
          </View>
        )}
      </View>
      {shownFriends.length > 0 && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); onPressFriends(); }} style={styles.friendJoinedRow}>
          <View style={styles.avatarStack}>
            {shownFriends.map((p, i) => (
              <View key={p.uid} style={[styles.avatarStackItem, { marginLeft: i === 0 ? 0 : -10, zIndex: shownFriends.length - i, borderColor: colors.card }]}>
                <FriendAvatar username={p.username} avatarUrl={p.avatarUrl} size={22} colors={colors} />
              </View>
            ))}
          </View>
          <Text style={[styles.friendJoinedText, { color: colors.secondaryText }]} numberOfLines={1}>
            {friendJoinedLabel(shownFriends.map((p) => p.username || "A friend"), friendOverflow)}
          </Text>
        </TouchableOpacity>
      )}
      <Text style={[styles.cardDesc, { color: colors.secondaryText }]} numberOfLines={2}>{opp.description}</Text>
      <View style={styles.cardMeta}>
        {[{ icon: "location-outline", text: opp.location }, { icon: "people-outline", text: `Ages ${opp.ageRange}` }, { icon: "pricetag-outline", text: opp.category }].map((m) => (
          <View key={m.text} style={styles.metaItem}>
            <Ionicons name={m.icon as any} size={13} color={colors.tabBarInactive} />
            <Text style={[styles.metaText, { color: colors.tabBarInactive }]}>{m.text}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.learnMore, { color: colors.primary }]}>View details <Ionicons name="arrow-forward" size={12} color={colors.primary} /></Text>
    </TouchableOpacity>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ opp: oppProp, saved, joined, onToggleSave, onRegister, onClose, colors }: { opp: Opportunity | null; saved: boolean; joined: boolean; onToggleSave: () => void; onRegister: () => void; onClose: () => void; colors: any }) {
  // Freezes the last real opportunity through the close animation — oppProp
  // going null (the parent's onClose clearing `selected`) used to unmount
  // this component (and the literal `visible` it hardcoded true on
  // BottomSheet) instantly, skipping the close animation entirely rather
  // than just letting BottomSheet's own visible={false} play it out.
  const lastOppRef = useRef<Opportunity | null>(null);
  if (oppProp) lastOppRef.current = oppProp;
  const opp = oppProp ?? lastOppRef.current;
  // saved/joined are derived by the parent from `selected` (see the
  // OpportunitiesScreen call site: `saved={selected ? saved.includes(...) :
  // false}`) — the instant selected goes null to start the close animation,
  // both would otherwise snap to false, flipping the heart icon to empty and
  // "You're Registered" back to "Register Interest" while the sheet is still
  // visibly sliding shut. Frozen the same way opp itself is, just above.
  // Both refs are declared before the `if (!opp) return null` below —
  // conditionally calling useRef only on the branch where opp is non-null
  // would violate the rules of hooks (every hook must run on every render,
  // regardless of any early return further down).
  const lastSavedRef = useRef(false);
  const lastJoinedRef = useRef(false);
  if (oppProp) {
    lastSavedRef.current = saved;
    lastJoinedRef.current = joined;
  }
  const effectiveSaved = oppProp ? saved : lastSavedRef.current;
  const effectiveJoined = oppProp ? joined : lastJoinedRef.current;

  // MVP notice — real registration (services/workshopService.ts's
  // joinWorkshop) is fully built and stays completely intact; this is purely
  // a UI-layer gate in front of it (see constants/featureFlags.ts's own
  // comment on why). Rendered as this same sheet's `overlay` (one native
  // Modal, no stacking risk) rather than a second Modal — same fix already
  // applied to Community's message delete and PostCard's post delete.
  const [mvpNoticeVisible, setMvpNoticeVisible] = useState(false);
  function handleRegisterPress() {
    if (!FEATURE_FLAGS.exploreRegistrationEnabled) {
      setMvpNoticeVisible(true);
      return;
    }
    onRegister();
  }
  const mvpNotice = mvpRegistrationNoticeCopy("register");

  if (!opp) return null;
  const openMaps = () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(opp.mapsQuery ?? opp.location)}`);

  return (
    <BottomSheet
      visible={!!oppProp}
      onClose={onClose}
      colors={colors}
      maxHeight="92%"
      overlay={
        <ConfirmModal
          asOverlay
          visible={mvpNoticeVisible}
          title={mvpNotice.title}
          message={mvpNotice.message}
          confirmLabel="Got it"
          hideCancel
          onConfirm={() => setMvpNoticeVisible(false)}
          onCancel={() => setMvpNoticeVisible(false)}
        />
      }
    >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={[styles.costBadge, { backgroundColor: COST_COLORS[opp.cost] + "18", alignSelf: "flex-start", marginBottom: 6 }]}>
                  <Text style={[styles.costText, { color: COST_COLORS[opp.cost] }]}>{opp.cost}</Text>
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{opp.name}</Text>
                <Text style={[styles.modalOrg, { color: colors.primary }]}>{opp.organisation}</Text>
              </View>
              <TouchableOpacity onPress={onToggleSave} style={{ padding: 4, marginTop: 4 }}>
                <Ionicons name={effectiveSaved ? "heart" : "heart-outline"} size={28} color={effectiveSaved ? "#EF4444" : colors.tabBarInactive} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.text }]}>{opp.description}</Text>

            <Text style={[styles.detailSection, { color: colors.text }]}>What you get</Text>
            {opp.highlights.map((h, i) => (
              <View key={i} style={styles.highlightRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[{ fontSize: 14, color: colors.text }]}>{h}</Text>
              </View>
            ))}

            <Text style={[styles.detailSection, { color: colors.text }]}>Details</Text>
            <View style={[styles.infoGrid, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {[{ icon: "location-outline", label: "Location", value: opp.location }, { icon: "people-outline", label: "Age Range", value: opp.ageRange }, { icon: "pricetag-outline", label: "Category", value: opp.category }, { icon: "cash-outline", label: "Cost", value: opp.cost }].map((row) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                  <Ionicons name={row.icon as any} size={16} color={colors.secondaryText} style={{ marginRight: 10, width: 20 }} />
                  <Text style={[styles.infoLabel, { color: colors.secondaryText }]}>{row.label}</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Open in Maps */}
            <TouchableOpacity onPress={openMaps} style={[styles.linkBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Ionicons name="map-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[{ fontSize: 14, fontWeight: "600", flex: 1, color: colors.primary }]}>Open in Google Maps</Text>
              <Ionicons name="open-outline" size={13} color={colors.primary} />
            </TouchableOpacity>

            {(opp.contact || opp.website) && (
              <>
                <Text style={[styles.detailSection, { color: colors.text }]}>Contact</Text>
                {opp.contact && (
                  <TouchableOpacity onPress={() => Linking.openURL(`mailto:${opp.contact}`)} style={[styles.linkBtn, { backgroundColor: colors.primary + "12", borderColor: colors.primary }]}>
                    <Ionicons name="mail-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={[{ fontSize: 14, fontWeight: "600", flex: 1, color: colors.primary }]}>{opp.contact}</Text>
                  </TouchableOpacity>
                )}
                {opp.website && (
                  <TouchableOpacity onPress={() => Linking.openURL(opp.website!)} style={[styles.linkBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="globe-outline" size={16} color={colors.text} style={{ marginRight: 8 }} />
                    <Text style={[{ fontSize: 14, fontWeight: "600", flex: 1, color: colors.text }]}>Visit Website</Text>
                    <Ionicons name="open-outline" size={13} color={colors.secondaryText} />
                  </TouchableOpacity>
                )}
              </>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10, paddingTop: 8 }}>
            <TouchableOpacity onPress={handleRegisterPress} style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2 }]}>
              <Ionicons name={effectiveJoined ? "checkmark-circle-outline" : "pencil-outline"} size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{effectiveJoined ? "You're Registered" : "Register Interest"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}>
              <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>
    </BottomSheet>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OpportunitiesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const { acceptedFriends } = useFriends();
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(params.category || "All");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [registering, setRegistering] = useState(false);
  const [myWorkshopIds, setMyWorkshopIds] = useState<Set<string>>(new Set());
  const [friendsByWorkshop, setFriendsByWorkshop] = useState<Map<string, string[]>>(new Map());
  const [friendActivityForList, setFriendActivityForList] = useState<{ workshop: Opportunity; uids: string[] } | null>(null);
  const { selectedUid: cardUid, openUserProfile: openCard, closeUserProfile: closeCard } = useUserProfileSheet();

  // Deep-link support (e.g. from the Hidden Hobbies Quiz result screen) — re-apply
  // even if this tab was already mounted, since expo-router won't remount it.
  useEffect(() => {
    if (params.category) setActiveCategory(params.category);
  }, [params.category]);

  // Real, persisted "which workshops did I join" — used for the "You joined"
  // badge. Refreshed after every successful join (refreshMyWorkshops below),
  // never a full-screen reload.
  const refreshMyWorkshops = useCallback(async () => {
    if (!user) return;
    try {
      const mine = await fetchUserWorkshops(user.uid);
      setMyWorkshopIds(new Set(mine.map((w) => w.workshopId)));
    } catch (e) {
      if (__DEV__) console.warn("[Opportunities] failed to load your joined workshops", e);
    }
  }, [user]);

  useEffect(() => {
    refreshMyWorkshops();
  }, [refreshMyWorkshops]);

  // Real "which of my friends joined which workshop" — one bounded batch
  // query (services/workshopService.ts), never one query per friend/card.
  useEffect(() => {
    let cancelled = false;
    fetchFriendWorkshopParticipants(acceptedFriends.map((f) => f.uid))
      .then((map) => { if (!cancelled) setFriendsByWorkshop(map); })
      .catch((e) => { if (__DEV__) console.warn("[Opportunities] failed to load friend workshop activity", e); });
    return () => { cancelled = true; };
  }, [acceptedFriends]);

  const allFriendParticipantUids = useMemo(() => {
    const set = new Set<string>();
    friendsByWorkshop.forEach((uids) => uids.forEach((u) => set.add(u)));
    return Array.from(set);
  }, [friendsByWorkshop]);
  const friendParticipantProfiles = useAuthorProfiles(allFriendParticipantUids);

  function friendProfilesFor(workshopId: string) {
    const uids = friendsByWorkshop.get(workshopId) ?? [];
    return uids
      .map((uid) => friendParticipantProfiles.get(uid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ uid: p.uid, username: p.username, avatarUrl: p.avatarUrl }));
  }

  const saved = profile.savedOpportunities ?? [];
  const city = profile.city ?? "";

  function toggleSave(id: string) {
    const updated = saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];
    saveProfile({ ...profile, savedOpportunities: updated });
  }

  // Only offer the "Near You" filter once the user has a city set on their profile
  const categories = city.trim() ? ["All", "Near You", "Saved", ...CATEGORIES.slice(2)] : CATEGORIES;
  // Fall back to "All" if the category the user had selected disappears (e.g. city was cleared)
  const effectiveCategory = categories.includes(activeCategory) ? activeCategory : "All";

  const filtered = OPPORTUNITIES.filter((o) => {
    if (effectiveCategory === "Saved") return saved.includes(o.id);
    if (effectiveCategory === "Near You") return isNearCity(o.location, city);
    const matchCat = effectiveCategory === "All" || o.category === effectiveCategory;
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.category.toLowerCase().includes(search.toLowerCase()) || o.location.toLowerCase().includes(search.toLowerCase()) || o.organisation.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }).sort((a, b) => {
    // Surface nearby opportunities first without hiding the rest
    if (effectiveCategory === "Saved" || effectiveCategory === "Near You") return 0;
    const aNear = isNearCity(a.location, city);
    const bNear = isNearCity(b.location, city);
    return aNear === bNear ? 0 : aNear ? -1 : 1;
  });

  return (
    <SwipeableTab tabIndex={1} backgroundColor={colors.background} colors={colors}>
      {/* Bottom inset excluded — the Tabs navigator's own tab bar already
          reserves it (see hooks/useTabBarHeight.ts). */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.disclaimerPad}>
          <InlinePageDisclaimer screenKey="/opportunities" colors={colors} />
        </View>

        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTopRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Explore</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.countText, { color: colors.primary }]} numberOfLines={1}>
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </Text>
            </View>
          </View>
          <Text style={[styles.headerSub, { color: colors.secondaryText }]} numberOfLines={2}>
            Programs, clubs & communities near you
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.searchWrap}>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.secondaryText} style={{ marginRight: 8 }} />
              <TextInput style={[styles.searchInput, { color: colors.text }]} placeholder="Search by hobby, location, name..." placeholderTextColor={colors.secondaryText} value={search} onChangeText={setSearch} />
              {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.secondaryText} /></TouchableOpacity>}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryStrip}>
            {categories.map((cat) => {
              const isActive = cat === effectiveCategory;
              return (
                <TouchableOpacity key={cat} onPress={() => setActiveCategory(cat)} style={[styles.categoryChip, { borderColor: isActive ? colors.primary : colors.border, backgroundColor: isActive ? colors.primary : colors.card }]}>
                  {cat === "Saved" && <Ionicons name="heart" size={12} color={isActive ? "#fff" : "#EF4444"} style={{ marginRight: 4 }} />}
                  {cat === "Near You" && <Ionicons name="location" size={12} color={isActive ? "#fff" : colors.primary} style={{ marginRight: 4 }} />}
                  <Text style={[styles.categoryChipText, { color: isActive ? "#fff" : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.resultsList}>
            {filtered.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={effectiveCategory === "Saved" ? "heart-outline" : "search-outline"} size={40} color={colors.secondaryText} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{effectiveCategory === "Saved" ? "No saved items yet" : effectiveCategory === "Near You" ? "Nothing near you yet" : "No results found"}</Text>
                <Text style={[styles.emptyBody, { color: colors.secondaryText }]}>{effectiveCategory === "Saved" ? "Tap ♡ on any card to save it here." : effectiveCategory === "Near You" ? "No programs currently match your city." : "Try a different search or category."}</Text>
                {effectiveCategory !== "Saved" && (
                  <TouchableOpacity onPress={() => { setSearch(""); setActiveCategory("All"); }} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: "#fff", fontWeight: "600" }}>Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filtered.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opp={opp}
                  saved={saved.includes(opp.id)}
                  near={isNearCity(opp.location, city)}
                  joined={myWorkshopIds.has(opp.id)}
                  friendProfiles={friendProfilesFor(opp.id)}
                  colors={colors}
                  onPress={() => setSelected(opp)}
                  onToggleSave={() => toggleSave(opp.id)}
                  onPressFriends={() => setFriendActivityForList({ workshop: opp, uids: friendsByWorkshop.get(opp.id) ?? [] })}
                />
              ))
            )}
          </View>

          <View style={[styles.footerNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={[styles.footerText, { color: colors.secondaryText }]}>Know of a programme we're missing? Share it in Community!</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <DetailModal
          opp={selected}
          saved={selected ? saved.includes(selected.id) : false}
          joined={selected ? myWorkshopIds.has(selected.id) : false}
          onToggleSave={() => selected && toggleSave(selected.id)}
          onRegister={() => setRegistering(true)}
          onClose={() => setSelected(null)}
          colors={colors}
        />
        <RegistrationModal
          visible={registering}
          opp={selected}
          onClose={() => setRegistering(false)}
          colors={colors}
          onJoined={refreshMyWorkshops}
        />

        {/* Friends who joined this workshop — real participant uids resolved to profiles, never a fabricated list. */}
        <BottomSheet visible={!!friendActivityForList} onClose={() => setFriendActivityForList(null)} colors={colors} maxHeight="60%">
          {friendActivityForList && (
            <>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: 18 }]}>Friends who joined</Text>
              <Text style={{ color: colors.secondaryText, fontSize: 13, marginBottom: 14 }}>{friendActivityForList.workshop.name}</Text>
              <ScrollView>
                {friendActivityForList.uids.map((uid) => {
                  const p = friendParticipantProfiles.get(uid);
                  if (!p) return null;
                  return (
                    <TouchableOpacity
                      key={uid}
                      onPress={() => openCard(uid)}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${p.username}'s profile`}
                    >
                      <FriendAvatar username={p.username} avatarUrl={p.avatarUrl} size={40} colors={colors} />
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{p.username}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </BottomSheet>

        <UserCardSheet uid={cardUid} colors={colors} onClose={closeCard} />
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  disclaimerPad: { paddingHorizontal: 16, paddingTop: 10 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, gap: 4 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, lineHeight: 18 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexShrink: 0 },
  countText: { fontWeight: "700", fontSize: 13 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15 },
  categoryStrip: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 13, fontWeight: "600" },
  resultsList: { paddingHorizontal: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTop: { flexDirection: "row", marginBottom: 8, gap: 8 },
  cardName: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  cardOrg: { fontSize: 13 },
  costBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  costText: { fontSize: 11, fontWeight: "700" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nearBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  nearBadgeText: { fontSize: 11, fontWeight: "700" },
  friendJoinedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  avatarStack: { flexDirection: "row", alignItems: "center" },
  avatarStackItem: { borderRadius: 12, borderWidth: 1.5 },
  friendJoinedText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  cardDesc: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12 },
  learnMore: { fontSize: 13, fontWeight: "700" },
  emptyCard: { alignItems: "center", padding: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed" },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  emptyBody: { textAlign: "center", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  footerNote: { flexDirection: "row", alignItems: "center", margin: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  footerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  // Modals
  modalTitle: { fontSize: 22, fontWeight: "800", marginBottom: 6, letterSpacing: -0.3 },
  modalOrg: { fontSize: 14, fontWeight: "600" },
  modalDesc: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  detailSection: { fontSize: 15, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  highlightRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  infoGrid: { borderRadius: 12, borderWidth: 1, marginBottom: 16, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1 },
  infoLabel: { flex: 1, fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "600" },
  linkBtn: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 15, borderRadius: 14 },
  cancelBtn: { borderWidth: 1, borderRadius: 14, padding: 15, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 },
});
