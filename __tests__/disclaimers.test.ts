import { DISCLAIMERS, disclaimerKey, disclaimersForRoute } from "../constants/disclaimers";

describe("disclaimers registry", () => {
  it("every disclaimer has a unique id", () => {
    const ids = DISCLAIMERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("disclaimerKey combines id and version so a version bump changes the dismissal key", () => {
    expect(disclaimerKey({ id: "community_guidelines", version: 1 })).toBe("community_guidelines_v1");
    expect(disclaimerKey({ id: "community_guidelines", version: 2 })).toBe("community_guidelines_v2");
  });

  it("disclaimersForRoute only returns active disclaimers for the exact route", () => {
    const results = disclaimersForRoute("/community");
    expect(results.length).toBeGreaterThan(0);
    for (const d of results) {
      expect(d.route).toBe("/community");
      expect(d.isActive).toBe(true);
    }
  });

  it("disclaimersForRoute returns an empty list for a route with no disclaimers", () => {
    expect(disclaimersForRoute("/some-unrelated-route")).toEqual([]);
  });

  it("disclaimersForRoute sorts by descending priority", () => {
    const results = disclaimersForRoute("/community");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].priority).toBeGreaterThanOrEqual(results[i].priority);
    }
  });

  // Every main tab screen mounts its own InlinePageDisclaimer with a fixed
  // screenKey (see app/(tabs)/*.tsx) — each of those keys must resolve to a
  // real, active entry or that screen silently shows nothing.
  it("every main tab route has at least one active disclaimer", () => {
    const mainTabRoutes = ["/", "/time-manager", "/community", "/opportunities", "/profile"];
    for (const route of mainTabRoutes) {
      expect(disclaimersForRoute(route).length).toBeGreaterThan(0);
    }
  });
});
