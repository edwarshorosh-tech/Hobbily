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

  it("blocks the most common English curse words — missing from the v1 dictionary, the actual root cause of 'English profanity isn't blocked'", () => {
    expect(checkText("fuck this").allowed).toBe(false);
    expect(checkText("what the fuck").allowed).toBe(false);
    expect(checkText("this is shit").allowed).toBe(false);
    expect(checkText("you're such a fucking idiot").allowed).toBe(false);
  });

  it("blocks emoji-obfuscated profanity", () => {
    expect(checkText("f😀u😀c😀k you").allowed).toBe(false);
  });

  it("blocks plain Russian profanity", () => {
    const r = checkText("ты сука конченая");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("profanity");
  });

  it("blocks v3 Russian profanity additions", () => {
    expect(checkText("ну ты и придурок").allowed).toBe(false);
    expect(checkText("иди повесься").allowed).toBe(false);
  });

  it("blocks Hebrew profanity", () => {
    const r = checkText("אתה חרא אמיתי");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("profanity");
  });

  it("blocks a Hebrew threat phrase", () => {
    const r = checkText("אני אהרוג אותך מחר");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("threat");
  });

  it("does not false-positive on ordinary Hebrew text", () => {
    expect(checkText("אני אוהב לצייר ולטייל").allowed).toBe(true);
  });

  it("blocks Arabic profanity", () => {
    const r = checkText("انت غبي جدا");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("profanity");
  });

  it("blocks an Arabic self-harm-encouragement phrase", () => {
    const r = checkText("انتحر الان");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("self_harm_encouragement");
  });

  it("does not false-positive on ordinary Arabic text", () => {
    expect(checkText("أنا أحب الرسم والسفر").allowed).toBe(true);
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
