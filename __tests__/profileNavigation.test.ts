import { friendsWidgetProfileTarget, shouldFocusFriendsWidget } from "../utils/profileNavigation";

describe("friendsWidgetProfileTarget", () => {
  it("targets the Profile route", () => {
    expect(friendsWidgetProfileTarget().pathname).toBe("/(tabs)/profile");
  });

  it("selects the Overview internal tab (where the Friends widget lives)", () => {
    expect(friendsWidgetProfileTarget().params.tab).toBe("overview");
  });

  it("requests the friends section as the focus target", () => {
    expect(friendsWidgetProfileTarget().params.focus).toBe("friends");
  });
});

describe("shouldFocusFriendsWidget", () => {
  it("triggers only for the exact 'friends' focus value", () => {
    expect(shouldFocusFriendsWidget("friends")).toBe(true);
  });

  it("does not trigger when there is no focus param", () => {
    expect(shouldFocusFriendsWidget(undefined)).toBe(false);
  });

  it("does not trigger for an unrelated focus value", () => {
    expect(shouldFocusFriendsWidget("posts")).toBe(false);
  });

  it("does not trigger for an array value (defensive against a malformed query string)", () => {
    expect(shouldFocusFriendsWidget(["friends"])).toBe(false);
  });
});
