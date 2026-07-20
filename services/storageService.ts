/**
 * storageService
 * Firebase Storage CRUD for the user's profile picture and post photos.
 * Files live at a UID-scoped path (never the username, which can change) so
 * ownership is enforceable purely from request.auth.uid in storage.rules.
 */
import { storage } from "../lib/firebase";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { mapFirebaseError, rawErrorCode } from "./firebaseErrors";

export type AvatarServiceErrorCode = "permission-denied" | "network-error" | "unknown";

export class AvatarServiceError extends Error {
  code: AvatarServiceErrorCode;
  constructor(code: AvatarServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AvatarServiceError";
    this.code = code;
  }
}

function mapStorageError(e: unknown): AvatarServiceError {
  const { code, message } = mapFirebaseError(e, "storageService");
  return new AvatarServiceError(code, message);
}

function avatarRef(uid: string) {
  return ref(storage, `users/${uid}/avatar/profile.jpg`);
}

/** Uploads the image at `localUri` (from expo-image-picker) and returns its download URL. */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const destination = avatarRef(uid);
    await uploadBytes(destination, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(destination);
    // The avatar always lives at the same fixed path, and Firebase Storage
    // typically keeps the same download token when a file is overwritten in
    // place — so this URL can come back byte-identical to the previous
    // upload's. Image components cache by URL, so without a cache-busting
    // suffix the new photo would silently never render even though the
    // upload succeeded. Appending "now" guarantees a fresh string every time.
    return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  } catch (e) {
    throw mapStorageError(e);
  }
}

/** Deletes the stored avatar file. Treats "already gone" as success, not an error. */
export async function removeAvatar(uid: string): Promise<void> {
  try {
    await deleteObject(avatarRef(uid));
  } catch (e) {
    if (rawErrorCode(e).includes("object-not-found")) return;
    throw mapStorageError(e);
  }
}

/** Each post photo gets its own file — unlike the avatar, there can be many per user. */
function postImageRef(uid: string) {
  return ref(storage, `posts/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
}

/** Uploads a post photo at `localUri` (from expo-image-picker) and returns its download URL. */
export async function uploadPostImage(uid: string, localUri: string): Promise<string> {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const destination = postImageRef(uid);
    await uploadBytes(destination, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(destination);
  } catch (e) {
    throw mapStorageError(e);
  }
}

/** Deletes a post photo by its download URL. Treats "already gone" as success, not an error. */
export async function deletePostImage(imageUrl: string): Promise<void> {
  try {
    await deleteObject(ref(storage, imageUrl));
  } catch (e) {
    if (rawErrorCode(e).includes("object-not-found")) return;
    throw mapStorageError(e);
  }
}
