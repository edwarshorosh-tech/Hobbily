/**
 * storageService
 * Firebase Storage CRUD for the user's profile picture and post photos.
 * Files live at a UID-scoped path (never the username, which can change) so
 * ownership is enforceable purely from request.auth.uid in storage.rules.
 *
 * Reads the local file via expo-file-system's File (real native byte read)
 * rather than fetch(localUri).blob() + uploadBytes(Blob). The fetch/Blob
 * route is a well-documented weak spot for the plain `firebase` npm package
 * on React Native: the RN Blob polyfill it hands to the Storage SDK doesn't
 * always support the internal slicing the SDK does when preparing an
 * upload, which surfaces as storage/cannot-slice-blob (or a wrong reported
 * file size) — and, critically, whatever the *real* cause, this service
 * used to fall every one of those into the same "upload-failed" bucket,
 * whose copy says "check your connection" regardless of what actually went
 * wrong. Reading real bytes up front sidesteps that whole class of bug, and
 * classifyStorageRawCode() below gives the genuinely-network-unrelated
 * Storage error codes (unauthenticated, quota-exceeded, invalid-argument,
 * cannot-slice-blob, ...) their own accurate messages instead of collapsing
 * everything unclassified into a connectivity story.
 */
import { Platform } from "react-native";
import { File } from "expo-file-system";
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
  | "storage-unavailable"
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
    case "storage-unavailable":
      return "Photo storage is temporarily unavailable. Please try again in a bit.";
    case "upload-failed":
    case "download-url-failed":
      // Deliberately doesn't claim this is a network problem — by the time
      // execution reaches this fallback, every raw Storage error code we
      // actually recognize (see classifyStorageRawCode) has already been
      // routed to a more specific, accurate message above.
      return "The upload didn't finish. Please try again.";
    case "profile-update-failed":
      return "Your photo uploaded, but saving it to your profile failed. Please try again.";
    case "delete-failed":
      return "Couldn't remove your photo. Please try again.";
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

/**
 * Firebase Storage SDK error codes (storage/...) that mean something more
 * specific than "network problem" or "no permission" — see
 * https://firebase.google.com/docs/storage/web/handle-errors. Checked before
 * falling back to the generic 3-bucket mapFirebaseError() classifier.
 */
function classifyStorageRawCode(rawCode: string): AvatarServiceErrorCode | null {
  if (rawCode.includes("unauthenticated")) return "not-authenticated";
  if (rawCode.includes("quota-exceeded") || rawCode.includes("no-default-bucket")) return "storage-unavailable";
  if (rawCode.includes("cannot-slice-blob") || rawCode.includes("invalid-checksum") || rawCode.includes("server-file-wrong-size")) {
    return "blob-conversion-failed";
  }
  if (
    rawCode.includes("invalid-argument") ||
    rawCode.includes("invalid-url") ||
    rawCode.includes("invalid-root-operation") ||
    rawCode.includes("invalid-event-name")
  ) {
    return "unsupported-file";
  }
  return null;
}

function mapStorageError(e: unknown, fallback: AvatarServiceErrorCode = "unknown"): AvatarServiceError {
  const rawMessage = e instanceof Error ? e.message : undefined;
  const specific = classifyStorageRawCode(rawErrorCode(e));
  if (specific) return new AvatarServiceError(specific, rawMessage);
  const { code, message } = mapFirebaseError(e, "storageService");
  if (code === "permission-denied") return new AvatarServiceError("storage-permission-denied", message);
  if (code === "network-error") return new AvatarServiceError("network-error", message);
  return new AvatarServiceError(fallback, rawMessage ?? message);
}

function avatarRef(uid: string) {
  return ref(storage, `users/${uid}/avatar/profile.jpg`);
}

/** Reads a local file (expo-image-picker's content:///file:// asset URI, or a blob: URI on web) into raw bytes for upload, without going through fetch().blob(). */
async function readLocalFileBytes(localUri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const response = await fetch(localUri);
    return new Uint8Array(await response.arrayBuffer());
  }
  const file = new File(localUri);
  if (!file.exists) throw new AvatarServiceError("invalid-uri");
  return await file.bytes();
}

/**
 * Uploads the image at `localUri` (an expo-image-picker asset URI) and
 * returns its download URL. `mimeType` should come from the picker asset's
 * own `mimeType` field when available (more reliable than sniffing) —
 * falls back to image/jpeg, which is what expo-image-picker's `allowsEditing`
 * crop step re-encodes to on both platforms. Each stage (read, validate,
 * upload, resolve URL) is classified separately so a failure's real cause
 * survives to the caller instead of collapsing into one generic error.
 */
export async function uploadAvatar(uid: string, localUri: string, mimeType?: string): Promise<string> {
  if (!uid) throw new AvatarServiceError("not-authenticated");
  if (!localUri) throw new AvatarServiceError("invalid-uri");

  let bytes: Uint8Array;
  try {
    bytes = await readLocalFileBytes(localUri);
  } catch (e) {
    if (e instanceof AvatarServiceError) throw e;
    throw new AvatarServiceError("blob-conversion-failed", e instanceof Error ? e.message : undefined);
  }

  const contentType = mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  if (bytes.byteLength === 0) throw new AvatarServiceError("blob-conversion-failed");
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new AvatarServiceError("file-too-large");

  const destination = avatarRef(uid);
  try {
    await uploadBytes(destination, bytes, { contentType });
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
export async function uploadPostImage(uid: string, localUri: string, mimeType?: string): Promise<string> {
  try {
    const bytes = await readLocalFileBytes(localUri);
    const destination = postImageRef(uid);
    await uploadBytes(destination, bytes, { contentType: mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg" });
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

/** Path includes the channel and the uploader's own uid — matches storage.rules' channels/{channelId}/{uid}/{fileName} ownership check. */
function channelImageRef(channelId: string, uid: string) {
  return ref(storage, `channels/${channelId}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
}

/** Uploads a community chat image attachment and returns its {url, storagePath} — the path is stored on the message doc so it (and it alone) can be deleted later. */
export async function uploadChannelImage(
  channelId: string,
  uid: string,
  localUri: string,
  mimeType?: string
): Promise<{ url: string; storagePath: string }> {
  const bytes = await readLocalFileBytes(localUri);
  const destination = channelImageRef(channelId, uid);
  try {
    await uploadBytes(destination, bytes, { contentType: mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg" });
  } catch (e) {
    throw mapStorageError(e, "upload-failed");
  }
  try {
    const url = await getDownloadURL(destination);
    return { url, storagePath: destination.fullPath };
  } catch (e) {
    throw mapStorageError(e, "download-url-failed");
  }
}
