import { describeFrequency, summarizeRecurrence } from "../utils/recurrenceSummary";
import { RecurrenceRule } from "../types/Recurrence";

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    type: "weekly",
    interval: 1,
    weekdays: [1, 3, 5],
    timeZone: "UTC",
    startsOn: "2026-08-03",
    ends: "never",
    until: null,
    ...overrides,
  };
}

describe("describeFrequency", () => {
  it("describes daily", () => {
    expect(describeFrequency(rule({ type: "daily", weekdays: [] }))).toBe("every day");
  });

  it("describes every day expressed as a weekly rule with all 7 days selected", () => {
    expect(describeFrequency(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] }))).toBe("every day");
  });

  it("describes weekdays", () => {
    expect(describeFrequency(rule({ weekdays: [1, 2, 3, 4, 5] }))).toBe("every weekday");
  });

  it("describes weekends", () => {
    expect(describeFrequency(rule({ weekdays: [6, 7] }))).toBe("every weekend");
  });

  it("describes a single custom day", () => {
    expect(describeFrequency(rule({ weekdays: [3] }))).toBe("every Wednesday");
  });

  it("describes two custom days joined with 'and'", () => {
    expect(describeFrequency(rule({ weekdays: [1, 3] }))).toBe("every Monday and Wednesday");
  });

  it("describes three custom days with a comma list and a trailing 'and'", () => {
    expect(describeFrequency(rule({ weekdays: [1, 3, 5] }))).toBe("every Monday, Wednesday and Friday");
  });

  it("is order-independent — unsorted weekdays still produce Monday-first phrasing", () => {
    expect(describeFrequency(rule({ weekdays: [5, 1, 3] }))).toBe("every Monday, Wednesday and Friday");
  });
});

describe("summarizeRecurrence", () => {
  it("builds the full sentence with time, no until clause when ends is never", () => {
    expect(summarizeRecurrence(rule({ type: "daily", weekdays: [] }), { hour: 18, minute: 0 })).toBe(
      "Repeats every day at 6:00 PM"
    );
  });

  it("includes an until clause when ends is on_date", () => {
    expect(
      summarizeRecurrence(rule({ weekdays: [6, 7], ends: "on_date", until: "2026-10-31" }), { hour: 9, minute: 0 })
    ).toBe("Repeats every weekend at 9:00 AM until October 31, 2026");
  });

  it("matches the exact weekday-list example from spec", () => {
    expect(summarizeRecurrence(rule({ weekdays: [1, 3, 5] }), { hour: 17, minute: 0 })).toBe(
      "Repeats every Monday, Wednesday and Friday at 5:00 PM"
    );
  });
});
