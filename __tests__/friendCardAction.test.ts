import { actionFor } from "../utils/friendCardAction";

describe("actionFor (UserCardSheet friend-state -> primary action)", () => {
  it("self has no add/accept action, just a self badge", () => {
    expect(actionFor("self")).toEqual({ label: "This is you", kind: "self" });
  });

  it("none allows sending a request", () => {
    expect(actionFor("none")).toEqual({ label: "Add Friend", kind: "add" });
  });

  it("outgoing pending shows 'Requested' (disabled in the UI)", () => {
    expect(actionFor("outgoing_pending")).toEqual({ label: "Requested", kind: "requested" });
  });

  it("incoming pending allows accepting", () => {
    expect(actionFor("incoming_pending")).toEqual({ label: "Accept Request", kind: "accept" });
  });

  it("friends allows removing", () => {
    expect(actionFor("friends")).toEqual({ label: "Friends", kind: "friends" });
  });

  it("falls back to the 'add' action for any other/unknown relationship state", () => {
    expect(actionFor("declined")).toEqual({ label: "Add Friend", kind: "add" });
    expect(actionFor("cancelled")).toEqual({ label: "Add Friend", kind: "add" });
  });
});
