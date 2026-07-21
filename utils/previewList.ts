/**
 * Shared "show the first N, +M more" logic used by PostCard's tag row and
 * UserCardSheet's hobby-tag row, so both stay consistent and are
 * independently testable.
 */
export type PreviewResult<T> = {
  visible: T[];
  overflowCount: number;
};

export function previewWithOverflow<T>(items: T[], maxVisible: number): PreviewResult<T> {
  const visible = items.slice(0, Math.max(0, maxVisible));
  return { visible, overflowCount: Math.max(0, items.length - visible.length) };
}
