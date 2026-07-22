import { friendJoinedLabel } from "../utils/friendActivityLabel";

describe("friendJoinedLabel", () => {
  it("returns empty string for no friends", () => {
    expect(friendJoinedLabel([], 0)).toBe("");
  });

  it("names a single friend with no overflow", () => {
    expect(friendJoinedLabel(["Lara"], 0)).toBe("Lara joined");
  });

  it("names a single friend plus overflow", () => {
    expect(friendJoinedLabel(["Lara"], 2)).toBe("Lara and 2 others joined");
    expect(friendJoinedLabel(["Lara"], 1)).toBe("Lara and 1 other joined");
  });

  it("names two friends with no overflow", () => {
    expect(friendJoinedLabel(["Lara", "Sam"], 0)).toBe("Lara and Sam joined");
  });

  it("names two friends plus overflow, folding the second named friend into the count", () => {
    expect(friendJoinedLabel(["Lara", "Sam"], 1)).toBe("Lara and 2 others joined");
  });
});
