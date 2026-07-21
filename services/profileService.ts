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
  freeTimePerDay: "30-60",
  hasOnboarded: false,
  savedOpportunities: [],
  themePreference: null,
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

  const isStale =
    !existing ||
    existing.username !== profile.username ||
    existing.usernameNormalized !== usernameNormalized ||
    existing.city !== profile.city ||
    existing.bio !== profile.bio ||
    JSON.stringify(existing.hobbies ?? []) !== JSON.stringify(profile.hobbies);

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
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
