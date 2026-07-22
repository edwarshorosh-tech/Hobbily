/** "Lara joined" / "Lara and Sam joined" / "Lara and 3 others joined" — used on workshop cards for real friend-participation context. `names` are the (up to 2) friends to name explicitly; `overflowCount` is how many more joined beyond those named. */
export function friendJoinedLabel(names: string[], overflowCount: number): string {
  if (names.length === 0) return "";
  if (names.length === 1) {
    return overflowCount === 0 ? `${names[0]} joined` : `${names[0]} and ${overflowCount} other${overflowCount > 1 ? "s" : ""} joined`;
  }
  if (overflowCount === 0) return `${names[0]} and ${names[1]} joined`;
  const totalOthers = names.length - 1 + overflowCount;
  return `${names[0]} and ${totalOthers} other${totalOthers > 1 ? "s" : ""} joined`;
}
