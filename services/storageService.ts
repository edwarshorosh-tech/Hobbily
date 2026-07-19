/**
 * storageService
 * Firebase Storage CRUD for the user's profile picture. Files live at a
 * UID-scoped path (never the username, which can change) so ownership is
 * enforceable purely from request.auth.uid in storage.rules.
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
    return await getDownloadURL(destination);
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
