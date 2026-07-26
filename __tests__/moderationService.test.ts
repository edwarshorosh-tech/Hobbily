import { checkText, moderationErrorMessage, shouldLogModerationEvent } from "../services/moderationService";

describe("checkText", () => {
  it("allows clean text", () => {
    expect(checkText("I love hiking and painting")).toEqual({ allowed: true });
  });

  it("allows empty/whitespace-only text (callers handle required-field validation separately)", () => {
    expect(checkText("").allowed).toBe(true);
    expect(checkText("   ").allowed).toBe(true);
  });

  it("blocks plain English profanity", () => {
    const r = checkText("this is such bullshit");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("profanity");
  });

  it("blocks plain Russian profanity", () => {
    const r = checkText("ты сука конченая");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("profanity");
  });

  it("blocks leetspeak-obfuscated profanity", () => {
    expect(checkText("you are an a55hole").allowed).toBe(false);
  });

  it("blocks letter-spaced-out obfuscated profanity", () => {
    expect(checkText("b i t c h please").allowed).toBe(false);
    expect(checkText("b.i.t.c.h.").allowed).toBe(false);
  });

  it("blocks Cyrillic-homoglyph-obfuscated Latin profanity", () => {
    const cyrillicA = "а"; // Cyrillic а, not Latin a
    expect(checkText(`${cyrillicA}sshole`).allowed).toBe(false);
  });

  it("does not false-positive on a legitimate word containing a short banned fragment (the classic Scunthorpe problem)", () => {
    expect(checkText("classic scunthorpe example").allowed).toBe(true);
    expect(checkText("I passed my class assignment").allowed).toBe(true);
  });

  it("does not false-positive on ordinary sentences with no banned content", () => {
    expect(checkText("Let's meet at the community center tomorrow at 5pm").allowed).toBe(true);
    expect(checkText("This workshop teaches watercolor painting basics").allowed).toBe(true);
  });

  it("blocks a threat phrase", () => {
    const r = checkText("i will kill you tomorrow");
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.category).toBe("threat");
      expect(r.severity).toBe("high");
    }
  });

  it("blocks a self-harm-encouragement phrase at critical severity", () => {
    const r = checkText("just kill yourself already");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.severity).toBe("critical");
  });

  it("flags a phone-number-shaped sequence as a personal data request", () => {
    const r = checkText("call me at 555-123-4567 ok");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("personal_data_request");
  });

  it("flags an email address as a personal data request", () => {
    expect(checkText("reach me at teen123@example.com").allowed).toBe(false);
  });

  it("never returns match positions — highlighting is intentionally out of scope, see the field-level UI fallback", () => {
    const r = checkText("this is such bullshit");
    if (!r.allowed) {
      expect(r.matchStart).toBeNull();
      expect(r.matchEnd).toBeNull();
    }
  });

  it("the `languages` option restricts which dictionary entries are checked", () => {
    expect(checkText("bullshit", { languages: ["ru"] }).allowed).toBe(true);
    expect(checkText("bullshit", { languages: ["en"] }).allowed).toBe(false);
  });
});

describe("shouldLogModerationEvent", () => {
  it("only logs high/critical severities", () => {
    expect(shouldLogModerationEvent("low")).toBe(false);
    expect(shouldLogModerationEvent("medium")).toBe(false);
    expect(shouldLogModerationEvent("high")).toBe(true);
    expect(shouldLogModerationEvent("critical")).toBe(true);
  });
});

describe("moderationErrorMessage", () => {
  it("returns distinct copy for content vs. profile-field surfaces, per spec", () => {
    expect(moderationErrorMessage("content")).toMatch(/highlighted part before publishing/i);
    expect(moderationErrorMessage("profile_field")).toMatch(/before saving/i);
  });

  it("never leaks the matched category or internal rule details", () => {
    const contentMsg = moderationErrorMessage("content");
    const fieldMsg = moderationErrorMessage("profile_field");
    for (const msg of [contentMsg, fieldMsg]) {
      expect(msg.toLowerCase()).not.toMatch(/profanity|threat|hate|slur|category|severity|rule/);
    }
  });
});
