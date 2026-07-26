/**
 * resolveAvatar — the one place that decides which avatar URI a screen
 * should actually render, given both a possible on-device local avatar
 * (services/localAvatarService.ts) and the real server avatarUrl
 * (publicProfiles/{uid}, users/{uid}). Never duplicate this priority logic
 * inline in a component — call this instead.
 */
export type ResolveAvatarInput = {
  /** uid of the profile being rendered (whose avatar this is). */
  viewedUserId: string;
  /** uid of the signed-in device user, or null if signed out. */
  currentUserId: string | null;
  /** This device's local-only avatar for viewedUserId, if any is loaded. Pass null when none exists or it hasn't loaded yet. */
  localAvatarUri: string | null;
  /** The real server avatar URL for viewedUserId, if any. */
  serverAvatarUrl: string | null;
};

/**
 * A local avatar is device-only and never implies anything about what other
 * users can see — it is only ever eligible when the viewer IS the account it
 * belongs to. For anyone else's profile, only the real server avatar is ever
 * considered; there is deliberately no fallback path that could leak a local
 * file URI into a context another user's device might render.
 */
export function resolveAvatar({ viewedUserId, currentUserId, localAvatarUri, serverAvatarUrl }: ResolveAvatarInput): string | null {
  const isOwnAccountOnThisDevice = currentUserId !== null && currentUserId === viewedUserId;
  if (isOwnAccountOnThisDevice && localAvatarUri) return localAvatarUri;
  return serverAvatarUrl ?? null;
}
