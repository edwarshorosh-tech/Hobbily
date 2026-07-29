import { isEntireWeekInPast, isPastPlannerDate, localDateISO } from "../utils/dateUtils";

const NOW = new Date(2026, 5, 15, 10, 30); // Mon, 2026-06-15, local time

describe("isPastPlannerDate", () => {
  it("is false for today", () => {
    expect(isPastPlannerDate({ selectedDate: localDateISO(NOW), now: NOW })).toBe(false);
  });

  it("is false for a future date", () => {
    expect(isPastPlannerDate({ selectedDate: "2026-06-16", now: NOW })).toBe(false);
  });

  it("is true for a past date, regardless of time of day", () => {
    expect(isPastPlannerDate({ selectedDate: "2026-06-14", now: NOW })).toBe(true);
  });

  it("does not depend on the time component of `now` — only the calendar day", () => {
    const lateNight = new Date(2026, 5, 15, 23, 59);
    const earlyMorning = new Date(2026, 5, 15, 0, 1);
    expect(isPastPlannerDate({ selectedDate: "2026-06-15", now: lateNight })).toBe(false);
    expect(isPastPlannerDate({ selectedDate: "2026-06-15", now: earlyMorning })).toBe(false);
  });
});

describe("isEntireWeekInPast", () => {
  it("is true when the week's last day is before today", () => {
    expect(isEntireWeekInPast({ weekEnd: "2026-06-14", now: NOW })).toBe(true);
  });

  it("is false when the week's last day is today", () => {
    expect(isEntireWeekInPast({ weekEnd: "2026-06-15", now: NOW })).toBe(false);
  });

  it("is false when the week's last day is in the future", () => {
    expect(isEntireWeekInPast({ weekEnd: "2026-06-21", now: NOW })).toBe(false);
  });
});
