import { previewWithOverflow } from "../utils/previewList";

describe("previewWithOverflow (PostCard tags / UserCardSheet hobbies)", () => {
  it("shows all items with no overflow when everything fits", () => {
    expect(previewWithOverflow(["a", "b"], 3)).toEqual({ visible: ["a", "b"], overflowCount: 0 });
  });

  it("shows exactly maxVisible items with no overflow at the boundary", () => {
    expect(previewWithOverflow(["a", "b", "c"], 3)).toEqual({ visible: ["a", "b", "c"], overflowCount: 0 });
  });

  it("caps at maxVisible and reports the correct +N overflow count", () => {
    expect(previewWithOverflow(["a", "b", "c", "d", "e"], 3)).toEqual({ visible: ["a", "b", "c"], overflowCount: 2 });
  });

  it("handles an empty list", () => {
    expect(previewWithOverflow([], 3)).toEqual({ visible: [], overflowCount: 0 });
  });

  it("treats a negative maxVisible the same as zero rather than throwing", () => {
    expect(previewWithOverflow(["a", "b"], -1)).toEqual({ visible: [], overflowCount: 2 });
  });
});
