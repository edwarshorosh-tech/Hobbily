import { resolveTabIcon } from "../utils/tabBarIcons";

describe("resolveTabIcon", () => {
  it("uses the outline glyph when inactive", () => {
    expect(resolveTabIcon("index", false)).toBe("home-outline");
    expect(resolveTabIcon("community", false)).toBe("chatbubbles-outline");
  });

  it("uses the filled glyph when active", () => {
    expect(resolveTabIcon("index", true)).toBe("home");
    expect(resolveTabIcon("community", true)).toBe("chatbubbles");
  });

  it("resolves every real tab route to a distinct outline/filled pair", () => {
    const routes = ["index", "time-manager", "community", "opportunities", "profile"];
    for (const route of routes) {
      const inactive = resolveTabIcon(route, false);
      const active = resolveTabIcon(route, true);
      expect(inactive).not.toBe("ellipse-outline");
      expect(active).not.toBe("ellipse-outline");
      expect(inactive).not.toBe(active);
    }
  });

  it("falls back to a neutral glyph for an unrecognized route name instead of crashing", () => {
    expect(resolveTabIcon("not-a-real-route", false)).toBe("ellipse-outline");
    expect(resolveTabIcon("not-a-real-route", true)).toBe("ellipse-outline");
  });
});
