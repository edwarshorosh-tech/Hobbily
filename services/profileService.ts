/**
 * profileService
 * Firestore CRUD for user profile documents stored at users/{uid}.
 * loadProfile merges fetched data over DEFAULT_PROFILE so all fields are
 * always present even for older accounts that predate new fields.
 *
 * Also keeps publicProfiles/{uid} — the safe-to-read-by-other-users subset
 * of the profile (username/usernameNormalized/city/avatarUrl/bio/hobbies —
 * deliberately never age, email, or anything more precise than city) — in
 * sync.
 * saveProfile updates both documents in one atomic batch; ensurePublicProfileFresh
 * lazily backfills/repairs the public copy for accounts that predate this field
 * (e.g. missing usernameNormalized) the next time their profile loads.
 */
import { db } from "../lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { Profile, ThemePreference } from "../types/Profile";
import { PublicProfile } from "../types/PublicProfile";
import { normalizeUsername } from "./friendsService";

/** The one canonical default-profile literal — context/ProfileContext.tsx imports this rather than keeping its own copy in sync by hand. */
export const DEFAULT_PROFILE: Profile = {
  username: "explorer",
  email: "",
  age: "",
  bio: "",
  hobbies: [],
  avatarUrl: null,
  preferredCity: "",
  city: "",
  localityId: null,
  locationSource: null,
  dismissedDisclaimers: {},
  freeTimePerDay: "30-60",
  hasOnboarded: false,
  savedOpportunities: [],
  themePreference: null,
  featuredAchievementIds: [],
  personalityTypeId: null,
  personalityTypeName: null,
  quizCompletedAt: null,
  quizVersion: 0,
  showPersonalityType: false,
};

export async function loadProfile(uid: string): Promise<Profile> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return { ...DEFAULT_PROFILE };
  return { ...DEFAULT_PROFILE, ...snap.data() } as Profile;
}

export async function saveProfile(uid: string, profile: Profile): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), profile, { merge: true });
  batch.set(
    doc(db, "publicProfiles", uid),
    {
      uid,
      username: profile.username,
      usernameNormalized: normalizeUsername(profile.username),
      city: profile.city,
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio,
      hobbies: profile.hobbies,
      featuredAchievementIds: profile.featuredAchievementIds,
      // Never mirrored publicly unless the user opted in — see showPersonalityType on types/Profile.ts.
      personalityTypeId: profile.showPersonalityType ? profile.personalityTypeId : null,
      personalityTypeName: profile.showPersonalityType ? profile.personalityTypeName : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

/**
 * Persists a freshly-computed quiz result to users/{uid}. Never touches
 * showPersonalityType — that stays whatever the user last chose (defaulting
 * to false), so completing (or retaking) the quiz never silently makes a
 * previously-hidden result public, and a newly-earned result stays private
 * until the user explicitly opts in via updatePersonalityVisibility.
 * publicProfiles is intentionally NOT written here for that same reason.
 */
export async function saveQuizResult(
  uid: string,
  result: { typeId: string; typeName: string; quizVersion: number }
): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    {
      personalityTypeId: result.typeId,
      personalityTypeName: result.typeName,
      quizCompletedAt: new Date().toISOString(),
      quizVersion: result.quizVersion,
    },
    { merge: true }
  );
}

/**
 * Turns the personality-type badge on/off for other users. Writes both
 * users/{uid} (the durable preference) and publicProfiles/{uid} (the actual
 * visible value — null when hidden) in one batch, so there's never a window
 * where the preference says "hidden" but the public doc still has the type.
 */
export async function updatePersonalityVisibility(
  uid: string,
  show: boolean,
  personalityTypeId: string | null,
  personalityTypeName: string | null
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), { showPersonalityType: show }, { merge: true });
  batch.set(
    doc(db, "publicProfiles", uid),
    {
      personalityTypeId: show ? personalityTypeId : null,
      personalityTypeName: show ? personalityTypeName : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

/**
 * Updates only the avatar URL, in both users/{uid} and publicProfiles/{uid},
 * in a single atomic batch. Applied immediately on upload/removal — separate
 * from the Settings "Save Changes" draft flow, since a photo change isn't a
 * pending edit the user needs to confirm.
 */
export async function updateAvatarUrl(uid: string, avatarUrl: string | null): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), { avatarUrl }, { merge: true });
  batch.set(doc(db, "publicProfiles", uid), { avatarUrl, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

/**
 * Updates only the theme preference, in users/{uid} — never publicProfiles,
 * since a user's dark/light choice isn't public data. Applied immediately on
 * toggle by ThemeContext (via ProfileContext.updateThemePreference), same
 * pattern as updateAvatarUrl: not part of the Settings draft/save flow.
 */
export async function updateThemePreference(uid: string, themePreference: ThemePreference): Promise<void> {
  await setDoc(doc(db, "users", uid), { themePreference }, { merge: true });
}

/**
 * Marks one disclaimer (id+version key — see constants/disclaimers.ts) as
 * dismissed. Uses setDoc with a dotted mergeFields path rather than a plain
 * {merge:true} of the whole dismissedDisclaimers map — the latter would
 * silently wipe out every other disclaimer this user already dismissed,
 * since Firestore's {merge:true} only merges at the top level, not inside
 * nested map values. setDoc (unlike updateDoc) also creates users/{uid} if
 * it doesn't exist yet — the quiz's disclaimer can be dismissed mid-
 * onboarding, before the profile doc is first created at onboarding finish.
 */
export async function dismissDisclaimer(uid: string, key: string): Promise<void> {
  const field = `dismissedDisclaimers.${key}`;
  await setDoc(doc(db, "users", uid), { dismissedDisclaimers: { [key]: new Date().toISOString() } }, { mergeFields: [field] });
}

/**
 * Lazily backfills/repairs publicProfiles/{uid} for accounts whose public copy
 * is missing or out of date (e.g. created before this field existed, or the
 * username/city changed elsewhere). Self-write, always permitted by rules —
 * this is the migration strategy: every existing user gets backfilled the
 * next time they open the app, with no admin script required.
 */
export async function ensurePublicProfileFresh(uid: string, profile: Profile): Promise<void> {
  const usernameNormalized = normalizeUsername(profile.username);
  const snap = await getDoc(doc(db, "publicProfiles", uid));
  const existing = snap.exists() ? (snap.data() as Partial<PublicProfile>) : null;

  const publicPersonalityTypeId = profile.showPersonalityType ? profile.personalityTypeId : null;
  const publicPersonalityTypeName = profile.showPersonalityType ? profile.personalityTypeName : null;

  const isStale =
    !existing ||
    existing.username !== profile.username ||
    existing.usernameNormalized !== usernameNormalized ||
    existing.city !== profile.city ||
    existing.bio !== profile.bio ||
    JSON.stringify(existing.hobbies ?? []) !== JSON.stringify(profile.hobbies) ||
    JSON.stringify(existing.featuredAchievementIds ?? []) !== JSON.stringify(profile.featuredAchievementIds) ||
    (existing.personalityTypeId ?? null) !== publicPersonalityTypeId ||
    (existing.personalityTypeName ?? null) !== publicPersonalityTypeName;

  if (!isStale) return;

  await setDoc(
    doc(db, "publicProfiles", uid),
    {
      uid,
      username: profile.username,
      usernameNormalized,
      city: profile.city,
      avatarUrl: existing?.avatarUrl ?? null,
      bio: profile.bio,
      hobbies: profile.hobbies,
      featuredAchievementIds: profile.featuredAchievementIds,
      personalityTypeId: publicPersonalityTypeId,
      personalityTypeName: publicPersonalityTypeName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
