/**
 * localAvatarService — a device-only profile photo, entirely separate from
 * the real cloud avatar upload in services/storageService.ts. Nothing here
 * ever touches Firebase Storage or writes a value into the user's server
 * profile document — the photo lives only in this device's app-private
 * documents directory (never the OS photo library/cache, which other apps
 * or the system could reach or clear), addressed by a stable per-uid path,
 * with its metadata in AsyncStorage.
 *
 * Deliberately behind the AvatarStorageProvider interface so a future real
 * "sync this to the cloud" feature can add a second implementation without
 * Profile screens needing to change how they read/write an avatar — see
 * hooks/useLocalAvatar.ts and utils/resolveAvatar.ts for how callers
 * actually consume this.
 */
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalAvatar = {
  userId: string;
  fileUri: string;
  width: number;
  height: number;
  mimeType: string;
  updatedAt: string;
  version: number;
};

export interface AvatarStorageProvider {
  getLocalAvatar(userId: string): Promise<LocalAvatar | null>;
  saveLocalAvatar(userId: string, sourceUri: string): Promise<LocalAvatar>;
  deleteLocalAvatar(userId: string): Promise<void>;
}

const METADATA_KEY_PREFIX = "@hobbily_local_avatar_";
/** Matches the resize target used below — a profile avatar never needs to be larger than this even on the biggest phone screens. */
const AVATAR_MAX_DIMENSION = 512;
/** Keeps a 512x512 JPEG comfortably under ~1MB for virtually any real photo. */
const AVATAR_COMPRESSION_QUALITY = 0.8;

function metadataKey(userId: string): string {
  return `${METADATA_KEY_PREFIX}${userId}`;
}

/** A real Firebase Auth uid is already a safe alphanumeric string — this is only a defensive backstop, and deliberately never derived from email/username (which can change or contain characters unsafe for a path segment). */
function safeUserDirName(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function userAvatarDirectory(userId: string): Directory {
  return new Directory(Paths.document, "avatars", safeUserDirName(userId));
}

class FileSystemAvatarStorageProvider implements AvatarStorageProvider {
  async getLocalAvatar(userId: string): Promise<LocalAvatar | null> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(metadataKey(userId));
    } catch {
      return null;
    }
    if (!raw) return null;

    let metadata: LocalAvatar;
    try {
      metadata = JSON.parse(raw) as LocalAvatar;
    } catch {
      await AsyncStorage.removeItem(metadataKey(userId)).catch(() => undefined);
      return null;
    }

    // The metadata record is only trustworthy if the file it points to still
    // actually exists — e.g. the app's local storage was partially cleared,
    // or this ran on a fresh install that restored AsyncStorage from a
    // backup without the actual file. A stale pointer must never be
    // reported as a real, displayable avatar.
    let fileStillExists = false;
    try {
      fileStillExists = new File(metadata.fileUri).exists;
    } catch {
      fileStillExists = false;
    }
    if (!fileStillExists) {
      await AsyncStorage.removeItem(metadataKey(userId)).catch(() => undefined);
      return null;
    }
    return metadata;
  }

  async saveLocalAvatar(userId: string, sourceUri: string): Promise<LocalAvatar> {
    // Resize + re-encode — this alone also drops the source's EXIF block
    // (including GPS location) since manipulation always produces a fresh
    // encoded image with only the data the manipulator itself writes.
    const context = ImageManipulator.manipulate(sourceUri);
    const rendered = await context.resize({ width: AVATAR_MAX_DIMENSION, height: AVATAR_MAX_DIMENSION }).renderAsync();
    const processed = await rendered.saveAsync({ compress: AVATAR_COMPRESSION_QUALITY, format: SaveFormat.JPEG });

    const dir = userAvatarDirectory(userId);
    if (!dir.exists) dir.create({ intermediates: true });

    const previous = await this.getLocalAvatar(userId);
    const nextVersion = (previous?.version ?? 0) + 1;
    const destFile = new File(dir, `avatar-v${nextVersion}.jpg`);

    // Atomic replace: the new file is fully written and verified BEFORE the
    // metadata pointer (the thing every reader actually trusts) is updated,
    // and the old file is only deleted after that succeeds — a failure at
    // any point before the final AsyncStorage write leaves the previous
    // avatar exactly as it was, never a broken/missing image.
    const processedFile = new File(processed.uri);
    processedFile.copy(destFile);
    if (!destFile.exists || destFile.size === 0) {
      throw new Error("Local avatar file failed to write.");
    }

    const metadata: LocalAvatar = {
      userId,
      fileUri: destFile.uri,
      width: processed.width,
      height: processed.height,
      mimeType: "image/jpeg",
      updatedAt: new Date().toISOString(),
      version: nextVersion,
    };
    await AsyncStorage.setItem(metadataKey(userId), JSON.stringify(metadata));

    if (previous && previous.fileUri !== destFile.uri) {
      try {
        const oldFile = new File(previous.fileUri);
        if (oldFile.exists) oldFile.delete();
      } catch {
        // An orphaned old-version file is a minor, non-fatal storage leak —
        // never worth failing an otherwise-successful save over.
      }
    }

    return metadata;
  }

  async deleteLocalAvatar(userId: string): Promise<void> {
    const current = await this.getLocalAvatar(userId);
    await AsyncStorage.removeItem(metadataKey(userId));
    if (current) {
      try {
        const file = new File(current.fileUri);
        if (file.exists) file.delete();
      } catch {
        // best-effort cleanup only
      }
    }
  }
}

export const localAvatarStorage: AvatarStorageProvider = new FileSystemAvatarStorageProvider();
