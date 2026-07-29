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

  it("blocks Hebrew profanity fully vocalized with niqqud", () => {
    // חרא (0x05D7 0x05E8 0x05D0) with sheva (0x05B0) and qamats (0x05B8) inserted
    const vocalized = String.fromCodePoint(0x05d7, 0x05b0, 0x05e8, 0x05b8, 0x05d0);
    expect(checkText(vocalized).allowed).toBe(false);
  });

  it("blocks a Hebrew threat phrase ending in a final letter form", () => {
    // Regression check: normalizeForModeration's Hebrew final-forms fold must
    // also be applied to the stored dictionary term (constants/
    // moderationTerms.ts's term() builder), or the input (folded) and the
    // term (unfolded) silently stop matching each other.
    const r = checkText("אני אהרוג אותך מחר");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.category).toBe("threat");
  });

  it("blocks Arabic profanity fully vocalized with harakat", () => {
    // غبي with fatha/kasra inserted
    const vocalized = String.fromCodePoint(0x063a, 0x064e, 0x0628, 0x0650, 0x064a);
    expect(checkText(vocalized).allowed).toBe(false);
  });

  it("blocks Arabic profanity obfuscated with Arabizi chat-alphabet digits", () => {
    // خرا ("crap") written as "5را" — Arabizi conventionally uses 5 for خ
    expect(checkText("5را").allowed).toBe(false);
  });

  it("blocks Russian profanity obfuscated with a Cyrillic/Latin homoglyph", () => {
    // сука with the Cyrillic с swapped for a visually identical Latin c
    const mixed = "c" + String.fromCodePoint(0x0443, 0x043a, 0x0430);
    const r = checkText(mixed);
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
