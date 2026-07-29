/** At least one letter/digit (any script) — rejects punctuation-only input like "..." or "!!!" and emoji-only input (emoji aren't \p{L}/\p{N}). */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;
/** A bare URL/domain, or something that reads like one ("instagram.com/x") — a hobby name should never be a link. */
const LOOKS_LIKE_URL = /(https?:\/\/|www\.|\.[a-z]{2,}\/)|\b[a-z0-9-]+\.(com|net|org|io|co|me|app|link)\b/iu;
/** Same character-or-digit run 5+ times in a row ("aaaaaaaa", "111111") — not a real hobby name. */
const EXCESSIVE_REPEATED_CHARS = /(.)\1{4,}/u;
export const MIN_CUSTOM_HOBBY_LENGTH = 2;
export const MAX_CUSTOM_HOBBY_LENGTH = 30;

/**
 * Cleans up a hobby label for storage/display — trims, collapses internal
 * whitespace runs, and applies Unicode NFKC normalization (so visually
 * identical inputs compare/display consistently). Deliberately does NOT
 * force a particular letter case: "iOS Development" or "K-pop" losing their
 * intentional capitalization to a blanket Title Case would be a worse
 * outcome than leaving whatever the user actually typed (after whitespace
 * cleanup) alone.
 */
export function normalizeHobbyName(input: string): string {
  return input.trim().replace(/\s+/g, " ").normalize("NFKC");
}

/**
 * Validates a candidate custom hobby (registration's "Search or add a
 * hobby" field) against everything already selected — trims, bounds
 * length, rejects punctuation-only/emoji-only/URL-like/excessively-repeated
 * text, and rejects a case-insensitive duplicate of anything already picked
 * (predefined or custom). Returns an error message, or null if the label is
 * valid and can be added. Content moderation (profanity/phone numbers/
 * emails — the latter two already covered by services/moderationService.ts's
 * personal_data_request regex terms) is a separate check the caller runs on
 * top of this one, not duplicated here.
 */
export function validateCustomHobby(rawLabel: string, alreadySelected: string[]): string | null {
  const label = normalizeHobbyName(rawLabel);
  if (!label) return "Type a hobby first.";
  if (label.length < MIN_CUSTOM_HOBBY_LENGTH) return `Must be at least ${MIN_CUSTOM_HOBBY_LENGTH} characters.`;
  if (label.length > MAX_CUSTOM_HOBBY_LENGTH) return `Must be ${MAX_CUSTOM_HOBBY_LENGTH} characters or fewer.`;
  if (!HAS_ALPHANUMERIC.test(label)) return "Please enter a real hobby name.";
  if (LOOKS_LIKE_URL.test(label)) return "Hobby names can't contain a link.";
  if (EXCESSIVE_REPEATED_CHARS.test(label)) return "Please enter a real hobby name.";
  const normalized = label.toLowerCase();
  if (alreadySelected.some((h) => h.toLowerCase() === normalized)) return "You've already added that.";
  return null;
}
