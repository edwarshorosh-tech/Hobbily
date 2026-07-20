/**
 * Explore screen — programs, clubs, and workshops.
 * Features: save/bookmark, registration form, Open in Maps, category filters.
 */
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Linking,
} from "react-native";
import { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useProfile } from "../../context/ProfileContext";
import SwipeableTab from "../../components/SwipeableTab";
import { brand } from "../../constants/colors";

// ── Data ──────────────────────────────────────────────────────────────────────

type Opportunity = {
  id: string; name: string; organisation: string; category: string;
  location: string; ageRange: string; cost: "Free" | "Subsidised" | "Paid";
  description: string; highlights: string[];
  contact?: string; website?: string; mapsQuery?: string;
};

const OPPORTUNITIES: Opportunity[] = [
  { id: "1", name: "Youth Photography Workshop", organisation: "Tel Aviv Museum of Art", category: "Photography", location: "Tel Aviv", ageRange: "14–18", cost: "Subsidised", description: "A 10-week photography programme covering composition, lighting, and digital editing. Participants display their work in a final group exhibition.", highlights: ["Weekly 2h sessions", "Camera equipment provided", "Final exhibition"], contact: "education@tamuseum.org.il", website: "https://www.tamuseum.org.il", mapsQuery: "Tel Aviv Museum of Art, Tel Aviv" },
  { id: "2", name: "Maktoob Youth Coding Bootcamp", organisation: "Maktoob / Google.org", category: "Coding", location: "Ramallah / Online", ageRange: "15–18", cost: "Free", description: "Intensive coding bootcamp teaching web development and entrepreneurship skills to Palestinian youth. Includes mentorship from tech professionals.", highlights: ["12-week programme", "Mentorship included", "Certificate on completion"], website: "https://www.maktoob.org" },
  { id: "3", name: "Football for Peace Academy", organisation: "Peres Center for Peace", category: "Sports", location: "Various cities (IL/PA)", ageRange: "13–17", cost: "Free", description: "Mixed Israeli and Palestinian football teams train together to build teamwork, leadership, and coexistence skills through sport.", highlights: ["Co-ed and mixed teams", "Free kit provided", "Regional tournaments"], contact: "youth@peres-center.org" },
  { id: "4", name: "Al-Kamandjati Music School", organisation: "Al-Kamandjati", category: "Music", location: "Ramallah / Dheisheh", ageRange: "13–18", cost: "Free", description: "Provides classical and Arabic music education to Palestinian youth, offering individual lessons, ensembles, and concerts.", highlights: ["Classical & Arabic music", "Instrument loans available", "Annual concerts"], website: "https://www.al-kamandjati.com", mapsQuery: "Al-Kamandjati Ramallah" },
  { id: "5", name: "Young Creators Art Studio", organisation: "Jerusalem Open House for Art", category: "Drawing & Art", location: "Jerusalem", ageRange: "14–18", cost: "Subsidised", description: "Bi-weekly studio sessions in painting, drawing, and mixed-media art. Students exhibit work at the end of each semester.", highlights: ["Materials provided", "Bi-weekly sessions", "Semester exhibition"], contact: "studio@joha.org.il", mapsQuery: "Jerusalem Open House for Art" },
  { id: "6", name: "Teen Film Lab", organisation: "Jerusalem Sam Spiegel Film School", category: "Film & Video", location: "Jerusalem", ageRange: "14–18", cost: "Subsidised", description: "A semester-long programme where teens write, direct, and edit their own short films. Equipment and editing suites are provided.", highlights: ["Camera & editing suite access", "Mentored by film students", "Showcase screening"], website: "https://www.jsfs.co.il", mapsQuery: "Sam Spiegel Film School Jerusalem" },
  { id: "7", name: "Surf Club Youth Programme", organisation: "Israel Surf Association", category: "Sports", location: "Tel Aviv Beach", ageRange: "13–18", cost: "Subsidised", description: "Learn-to-surf and intermediate sessions on Tel Aviv beach every weekend. Board and wetsuit rental included in the registration fee.", highlights: ["Weekend morning sessions", "Equipment included", "Safety certification"], contact: "youth@israelsurf.org.il", mapsQuery: "Tel Aviv Beach, Tel Aviv" },
  { id: "8", name: "Dance Fusion Workshop", organisation: "Vertigo Dance Company", category: "Dance", location: "Kibbutz Netiv HaLamed Heh", ageRange: "15–18", cost: "Subsidised", description: "Explore contemporary, hip-hop, and traditional dance forms with professional dancers. Summer and winter intensive options available.", highlights: ["Multi-style training", "Residential option", "Performance showcase"], website: "https://www.vertigo.org.il" },
  { id: "9", name: "Kitchen Explorers Cooking Club", organisation: "Arab-Jewish Community Centre Jaffa", category: "Cooking", location: "Jaffa / Tel Aviv", ageRange: "13–17", cost: "Free", description: "Bi-weekly cooking sessions exploring Mediterranean, Middle Eastern, and fusion cuisine. All ingredients provided.", highlights: ["All ingredients provided", "Bi-weekly sessions", "Cultural exchange focus"], contact: "community@ajccjaffa.org", mapsQuery: "Arab-Jewish Community Centre Jaffa" },
  { id: "10", name: "e-Sports and Game Design Camp", organisation: "Mifras Youth Tech Hub", category: "Gaming", location: "Haifa", ageRange: "13–18", cost: "Paid", description: "Multi-day camp covering competitive e-sports, basic game design in Unity, and streaming. Scholarships available for families with financial need.", highlights: ["Unity game design", "Streaming & content creation", "Scholarships available"], contact: "info@mifras.co.il", mapsQuery: "Haifa, Israel" },
  { id: "11", name: "Young Writers Circle", organisation: "Tamer Institute for Community Education", category: "Reading", location: "Ramallah / Gaza", ageRange: "13–18", cost: "Free", description: "A monthly workshop for youth interested in creative writing, poetry, and storytelling in Arabic. Works are published in the institute's youth magazine.", highlights: ["Arabic creative writing", "Monthly sessions", "Published in youth magazine"], website: "https://www.tamerinst.org" },
  { id: "12", name: "Robotics & STEM Club", organisation: "FIRST Israel / ORT Network", category: "Coding", location: "Multiple cities (IL)", ageRange: "14–18", cost: "Subsidised", description: "Join a FIRST Robotics team to build and compete with a robot at regional and international competitions.", highlights: ["International competitions", "Mentored by engineers", "ORT school network"], website: "https://www.firstisrael.org.il" },
];

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

function RegistrationModal({ opp, onClose, colors }: { opp: Opportunity; onClose: () => void; colors: any }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
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
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}>
                  <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { if (name.trim() && email.trim()) setSubmitted(true); }}
                  style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2, opacity: (!name.trim() || !email.trim()) ? 0.4 : 1 }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Submit</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp, saved, near, colors, onPress, onToggleSave }: { opp: Opportunity; saved: boolean; near: boolean; colors: any; onPress: () => void; onToggleSave: () => void }) {
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
      {near && (
        <View style={[styles.nearBadge, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="location" size={11} color={colors.primary} style={{ marginRight: 3 }} />
          <Text style={[styles.nearBadgeText, { color: colors.primary }]}>Near you</Text>
        </View>
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

function DetailModal({ opp, saved, onToggleSave, onRegister, onClose, colors }: { opp: Opportunity | null; saved: boolean; onToggleSave: () => void; onRegister: () => void; onClose: () => void; colors: any }) {
  if (!opp) return null;
  const openMaps = () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(opp.mapsQuery ?? opp.location)}`);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
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
                <Ionicons name={saved ? "heart" : "heart-outline"} size={28} color={saved ? "#EF4444" : colors.tabBarInactive} />
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
            <TouchableOpacity onPress={onRegister} style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 2 }]}>
              <Ionicons name="pencil-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Register Interest</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}>
              <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OpportunitiesScreen() {
  const { colors } = useTheme();
  const { profile, saveProfile } = useProfile();
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(params.category || "All");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [registering, setRegistering] = useState(false);

  // Deep-link support (e.g. from the Hidden Hobbies Quiz result screen) — re-apply
  // even if this tab was already mounted, since expo-router won't remount it.
  useEffect(() => {
    if (params.category) setActiveCategory(params.category);
  }, [params.category]);

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
    <SwipeableTab tabIndex={3} backgroundColor={colors.background}>
      {/* Bottom inset excluded — the Tabs navigator's own tab bar already
          reserves it (see hooks/useTabBarHeight.ts). */}
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: colors.background }]}>
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
                <OpportunityCard key={opp.id} opp={opp} saved={saved.includes(opp.id)} near={isNearCity(opp.location, city)} colors={colors} onPress={() => setSelected(opp)} onToggleSave={() => toggleSave(opp.id)} />
              ))
            )}
          </View>

          <View style={[styles.footerNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.secondaryText} style={{ marginRight: 8 }} />
            <Text style={[styles.footerText, { color: colors.secondaryText }]}>Know of a programme we're missing? Share it in Community!</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <DetailModal opp={selected} saved={selected ? saved.includes(selected.id) : false} onToggleSave={() => selected && toggleSave(selected.id)} onRegister={() => setRegistering(true)} onClose={() => setSelected(null)} colors={colors} />
        {registering && selected && <RegistrationModal opp={selected} onClose={() => setRegistering(false)} colors={colors} />}
      </SafeAreaView>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  nearBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  nearBadgeText: { fontSize: 11, fontWeight: "700" },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    maxHeight: "92%",
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 20 },
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
