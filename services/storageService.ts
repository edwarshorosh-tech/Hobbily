/**
 * storageService
 * Firebase Storage CRUD for the user's profile picture and post photos.
 * Files live at a UID-scoped path (never the username, which can change) so
 * ownership is enforceable purely from request.auth.uid in storage.rules.
 */
import { storage } from "../lib/firebase";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { mapFirebaseError, rawErrorCode } from "./firebaseErrors";

/**
 * Every distinct way avatar selection/upload can fail, kept specific rather
 * than collapsed into "unknown" — profile.tsx uses this to show a message
 * that actually matches what went wrong (permission dialog dismissed vs. a
 * file that's too large vs. a dead network vs. Storage rejecting the write).
 */
export type AvatarServiceErrorCode =
  | "not-authenticated"
  | "permission-denied"
  | "selection-cancelled"
  | "invalid-uri"
  | "unsupported-file"
  | "file-too-large"
  | "blob-conversion-failed"
  | "upload-failed"
  | "storage-permission-denied"
  | "download-url-failed"
  | "profile-update-failed"
  | "delete-failed"
  | "network-error"
  | "unknown";

export class AvatarServiceError extends Error {
  code: AvatarServiceErrorCode;
  constructor(code: AvatarServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AvatarServiceError";
    this.code = code;
  }
}

/** User-facing copy for every AvatarServiceErrorCode — the one place profile.tsx (or any future avatar UI) should look up a message. */
export function avatarErrorMessage(code: AvatarServiceErrorCode): string {
  switch (code) {
    case "not-authenticated":
      return "Please sign in again to update your photo.";
    case "permission-denied":
      return "Photo access was denied. Enable it in your device settings to add a profile picture.";
    case "invalid-uri":
      return "That photo couldn't be read. Please try a different one.";
    case "unsupported-file":
      return "Please choose an image file (JPG, PNG, etc).";
    case "file-too-large":
      return `Please choose a photo smaller than ${MAX_AVATAR_BYTES / (1024 * 1024)}MB.`;
    case "blob-conversion-failed":
      return "Couldn't process that photo. Please try a different one.";
    case "storage-permission-denied":
      return "You don't have permission to update this photo.";
    case "upload-failed":
    case "download-url-failed":
      return "The upload didn't finish. Please check your connection and try again.";
    case "profile-update-failed":
      return "Your photo uploaded, but saving it to your profile failed. Please try again.";
    case "delete-failed":
      return "Couldn't remove your photo. Please check your connection and try again.";
    case "network-error":
      return "Network error — please check your connection and try again.";
    case "selection-cancelled":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Matches storage.rules' `request.resource.size < 5 * 1024 * 1024` for the avatar path. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function mapStorageError(e: unknown, fallback: AvatarServiceErrorCode = "unknown"): AvatarServiceError {
  const { code, message } = mapFirebaseError(e, "storageService");
  if (code === "permission-denied") return new AvatarServiceError("storage-permission-denied", message);
  if (code === "network-error") return new AvatarServiceError("network-error", message);
  return new AvatarServiceError(fallback, message);
}

function avatarRef(uid: string) {
  return ref(storage, `users/${uid}/avatar/profile.jpg`);
}

/**
 * Uploads the image at `localUri` (an expo-image-picker asset URI — a
 * content:// or file:// URI on native, a blob: URI on web) and returns its
 * download URL. Each stage (read, validate, upload, resolve URL) is
 * classified separately so a failure's real cause survives to the caller
 * instead of collapsing into one generic error.
 */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  if (!uid) throw new AvatarServiceError("not-authenticated");
  if (!localUri) throw new AvatarServiceError("invalid-uri");

  let blob: Blob;
  try {
    const response = await fetch(localUri);
    if (!response.ok) throw new AvatarServiceError("invalid-uri");
    blob = await response.blob();
  } catch (e) {
    if (e instanceof AvatarServiceError) throw e;
    throw new AvatarServiceError("blob-conversion-failed", e instanceof Error ? e.message : undefined);
  }

  if (!blob.type.startsWith("image/")) throw new AvatarServiceError("unsupported-file");
  if (blob.size > MAX_AVATAR_BYTES) throw new AvatarServiceError("file-too-large");

  const destination = avatarRef(uid);
  try {
    await uploadBytes(destination, blob, { contentType: blob.type });
  } catch (e) {
    throw mapStorageError(e, "upload-failed");
  }

  let url: string;
  try {
    url = await getDownloadURL(destination);
  } catch (e) {
    throw mapStorageError(e, "download-url-failed");
  }

  // The avatar always lives at the same fixed path, and Firebase Storage
  // typically keeps the same download token when a file is overwritten in
  // place — so this URL can come back byte-identical to the previous
  // upload's. Image components cache by URL, so without a cache-busting
  // suffix the new photo would silently never render even though the
  // upload succeeded. Appending "now" guarantees a fresh string every time.
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

/** Deletes the stored avatar file. Treats "already gone" as success, not an error. */
export async function removeAvatar(uid: string): Promise<void> {
  if (!uid) throw new AvatarServiceError("not-authenticated");
  try {
    await deleteObject(avatarRef(uid));
  } catch (e) {
    if (rawErrorCode(e).includes("object-not-found")) return;
    throw mapStorageError(e, "delete-failed");
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
