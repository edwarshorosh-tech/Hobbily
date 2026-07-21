/** Matches the TextInput's `maxLength={1000}` in app/post/[id].tsx — kept here so the submit-path check and the input's hard cap agree. */
export const MAX_COMMENT_LENGTH = 1000;

/** The single trim rule used before persisting a comment (add or edit). */
export function normalizeCommentText(raw: string): string {
  return raw.trim();
}

export function isValidCommentText(raw: string): boolean {
  const trimmed = normalizeCommentText(raw);
  return trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH;
}
