import { mergePages, nextHasMoreAfterLiveUpdate, sortByCreatedAtDesc } from "../utils/pagination";

type Item = { id: string };
const item = (id: string): Item => ({ id });

describe("mergePages", () => {
  it("appends older items after the live page, preserving order", () => {
    const live = [item("3"), item("2")];
    const older = [item("1")];
    expect(mergePages(live, older, "after")).toEqual([item("3"), item("2"), item("1")]);
  });

  it("prepends older items before the live page (comments' oldest-first order)", () => {
    const live = [item("3")];
    const older = [item("1"), item("2")];
    expect(mergePages(live, older, "before")).toEqual([item("1"), item("2"), item("3")]);
  });

  it("does not create duplicate ids when the live page and older items overlap", () => {
    const live = [item("2"), item("1")];
    const older = [item("1"), item("0")]; // "1" already present in live
    const merged = mergePages(live, older, "after");
    const ids = merged.map((i) => i.id);
    expect(ids).toEqual(["2", "1", "0"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the live page always wins on overlap (freshest data)", () => {
    const live = [{ id: "1", v: "new" }];
    const older = [{ id: "1", v: "stale" }];
    expect(mergePages(live, older, "after")).toEqual([{ id: "1", v: "new" }]);
  });
});

describe("nextHasMoreAfterLiveUpdate", () => {
  it("before any older page is loaded, hasMore reflects whether the live page was full", () => {
    expect(nextHasMoreAfterLiveUpdate(15, 15, 0, false)).toBe(true);
    expect(nextHasMoreAfterLiveUpdate(3, 15, 0, false)).toBe(false);
  });

  it("once an older page has been loaded, a live update leaves hasMore untouched instead of forcing it false", () => {
    // Regression: previously a live update (e.g. a new post arriving) after
    // the user had already paged in older items would silently disable
    // "load more" even though more older items genuinely existed.
    expect(nextHasMoreAfterLiveUpdate(15, 15, 5, true)).toBe(true);
    expect(nextHasMoreAfterLiveUpdate(3, 15, 5, true)).toBe(true);
    expect(nextHasMoreAfterLiveUpdate(15, 15, 5, false)).toBe(false);
  });
});

describe("sortByCreatedAtDesc", () => {
  // Regression: useAuthorPosts fetches an author's posts with only a
  // `where("authorId","==",...)` Firestore query (no orderBy — see
  // services/postsService.ts for why a composite index is deliberately
  // avoided), so Firestore does not guarantee any particular order back.
  // This is the client-side substitute.
  it("sorts newest first", () => {
    const posts = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "c", createdAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(sortByCreatedAtDesc(posts).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const posts = [{ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }, { id: "b", createdAt: "2026-02-01T00:00:00.000Z" }];
    const original = [...posts];
    sortByCreatedAtDesc(posts);
    expect(posts).toEqual(original);
  });

  it("handles an empty list", () => {
    expect(sortByCreatedAtDesc([])).toEqual([]);
  });

  it("is stable-ish for equal timestamps (does not throw or duplicate/drop items)", () => {
    const posts = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const sorted = sortByCreatedAtDesc(posts);
    expect(sorted).toHaveLength(2);
    expect(new Set(sorted.map((p) => p.id))).toEqual(new Set(["a", "b"]));
  });
});
