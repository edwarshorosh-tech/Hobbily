import { isDateTimeInPast, parseTimeString, computeDefaultStart, formatTimeLabel } from "../utils/time";

describe("Planner time validation (isDateTimeInPast)", () => {
  const NOW = new Date(2026, 5, 15, 14, 0, 0, 0); // 2026-06-15 14:00 local

  it("treats an earlier time today as in the past", () => {
    expect(isDateTimeInPast("2026-06-15", { hour: 10, minute: 0 }, NOW)).toBe(true);
  });

  it("treats a later time today as valid (not past)", () => {
    expect(isDateTimeInPast("2026-06-15", { hour: 15, minute: 0 }, NOW)).toBe(false);
  });

  it("treats a future date as valid regardless of time-of-day", () => {
    expect(isDateTimeInPast("2026-06-16", { hour: 0, minute: 1 }, NOW)).toBe(false);
  });

  it("treats a past date as in the past regardless of time-of-day", () => {
    expect(isDateTimeInPast("2026-06-14", { hour: 23, minute: 59 }, NOW)).toBe(true);
  });

  it("applies a short grace period so a value valid moments ago doesn't immediately flip to past", () => {
    // 30 seconds before NOW is within the grace window.
    const almostNow = new Date(NOW.getTime() - 30_000);
    expect(isDateTimeInPast(computeDefaultStart(almostNow).date, parseTimeString(computeDefaultStart(almostNow).time)!, NOW)).toBe(
      false
    );
  });

  it("does not extend the grace period indefinitely", () => {
    const wellBefore = new Date(NOW.getTime() - 5 * 60_000); // 5 minutes earlier
    expect(isDateTimeInPast("2026-06-15", { hour: 13, minute: 55 }, wellBefore)).toBe(false); // valid relative to its own "now"
    expect(isDateTimeInPast("2026-06-15", { hour: 13, minute: 55 }, NOW)).toBe(true); // but stale relative to the real now
  });
});

describe("parseTimeString", () => {
  it("accepts a canonical zero-padded 24h time", () => {
    expect(parseTimeString("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTimeString("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("rejects malformed, partial, or out-of-range values without throwing", () => {
    expect(parseTimeString("14")).toBeNull();
    expect(parseTimeString("24:00")).toBeNull();
    expect(parseTimeString("12:66")).toBeNull();
    expect(parseTimeString(undefined)).toBeNull();
    expect(parseTimeString(null)).toBeNull();
    expect(parseTimeString(1400)).toBeNull();
    expect(parseTimeString("")).toBeNull();
  });
});

describe("formatTimeLabel", () => {
  it("never throws on a malformed value and falls back to a safe label", () => {
    expect(formatTimeLabel("14")).toEqual({ ok: false, label: "Time not set", reason: "invalid-time" });
    expect(formatTimeLabel(undefined)).toEqual({ ok: false, label: "Time not set", reason: "invalid-time" });
  });

  it("formats a valid time as a 12h label", () => {
    expect(formatTimeLabel("14:05")).toEqual({ ok: true, label: "2:05 PM" });
  });
});

describe("computeDefaultStart", () => {
  it("rolls over to the next day at 23:59", () => {
    const now = new Date(2026, 5, 15, 23, 59, 0, 0);
    const result = computeDefaultStart(now);
    expect(result.time).toBe("00:00");
    expect(result.date).toBe("2026-06-16");
  });

  it("otherwise just adds one minute on the same day", () => {
    const now = new Date(2026, 5, 15, 14, 25, 0, 0);
    const result = computeDefaultStart(now);
    expect(result.date).toBe("2026-06-15");
    expect(result.time).toBe("14:26");
  });
});
