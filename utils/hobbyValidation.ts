/** At least one letter/digit (any script) — rejects punctuation-only input like "..." or "!!!". */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;
export const MIN_CUSTOM_HOBBY_LENGTH = 2;
export const MAX_CUSTOM_HOBBY_LENGTH = 30;

/**
 * Validates a candidate custom hobby (registration's "Search or add a
 * hobby" field) against everything already selected — trims, bounds
 * length, rejects punctuation-only text, and rejects a case-insensitive
 * duplicate of anything already picked (predefined or custom). Returns an
 * error message, or null if the label is valid and can be added.
 */
export function validateCustomHobby(rawLabel: string, alreadySelected: string[]): string | null {
  const label = rawLabel.trim();
  if (!label) return "Type a hobby first.";
  if (label.length < MIN_CUSTOM_HOBBY_LENGTH) return `Must be at least ${MIN_CUSTOM_HOBBY_LENGTH} characters.`;
  if (label.length > MAX_CUSTOM_HOBBY_LENGTH) return `Must be ${MAX_CUSTOM_HOBBY_LENGTH} characters or fewer.`;
  if (!HAS_ALPHANUMERIC.test(label)) return "Please enter a real hobby name.";
  const normalized = label.toLowerCase();
  if (alreadySelected.some((h) => h.toLowerCase() === normalized)) return "You've already added that.";
  return null;
}
