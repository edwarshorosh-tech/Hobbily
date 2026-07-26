import { resolveAvatar } from "../utils/resolveAvatar";

describe("resolveAvatar", () => {
  it("prefers the local avatar for the current user's own account", () => {
    expect(
      resolveAvatar({ viewedUserId: "u1", currentUserId: "u1", localAvatarUri: "file:///local.jpg", serverAvatarUrl: "https://server/avatar.jpg" })
    ).toBe("file:///local.jpg");
  });

  it("falls back to the server avatar for the current user when no local avatar is set", () => {
    expect(
      resolveAvatar({ viewedUserId: "u1", currentUserId: "u1", localAvatarUri: null, serverAvatarUrl: "https://server/avatar.jpg" })
    ).toBe("https://server/avatar.jpg");
  });

  it("falls back to null (initials) when neither exists for the current user", () => {
    expect(resolveAvatar({ viewedUserId: "u1", currentUserId: "u1", localAvatarUri: null, serverAvatarUrl: null })).toBeNull();
  });

  it("never uses a local avatar for someone else's profile, even if one happens to be present in state", () => {
    expect(
      resolveAvatar({ viewedUserId: "u2", currentUserId: "u1", localAvatarUri: "file:///local.jpg", serverAvatarUrl: "https://server/u2-avatar.jpg" })
    ).toBe("https://server/u2-avatar.jpg");
  });

  it("shows another user's server avatar even with no local avatar involved", () => {
    expect(resolveAvatar({ viewedUserId: "u2", currentUserId: "u1", localAvatarUri: null, serverAvatarUrl: "https://server/u2-avatar.jpg" })).toBe(
      "https://server/u2-avatar.jpg"
    );
  });

  it("falls back to null for another user with no server avatar, regardless of local state", () => {
    expect(resolveAvatar({ viewedUserId: "u2", currentUserId: "u1", localAvatarUri: "file:///local.jpg", serverAvatarUrl: null })).toBeNull();
  });

  it("never uses a local avatar when signed out", () => {
    expect(resolveAvatar({ viewedUserId: "u1", currentUserId: null, localAvatarUri: "file:///local.jpg", serverAvatarUrl: null })).toBeNull();
  });
});
