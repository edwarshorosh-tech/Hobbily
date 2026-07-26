import {
  applyOccurrenceDelete,
  applyOccurrenceEdit,
  firstOccurrenceDate,
  getOccurrencesForRange,
  isoWeekday,
  Occurrence,
} from "../services/recurrenceService";
import { Task } from "../types/Task";
import { RecurrenceRule } from "../types/Recurrence";

function baseTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Practice guitar",
    type: "hobby",
    date: "2026-08-03", // a Monday
    time: "18:00",
    duration: 30,
    completed: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function weeklyRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    type: "weekly",
    interval: 1,
    weekdays: [1, 3, 5], // Mon/Wed/Fri
    timeZone: "UTC",
    startsOn: "2026-08-03",
    ends: "never",
    until: null,
    ...overrides,
  };
}

describe("isoWeekday", () => {
  it("returns 1 for Monday and 7 for Sunday", () => {
    expect(isoWeekday("2026-08-03")).toBe(1); // Monday
    expect(isoWeekday("2026-08-09")).toBe(7); // Sunday
  });
});

describe("getOccurrencesForRange — one-off tasks", () => {
  it("passes a one-off task through unchanged when it falls in range", () => {
    const task = baseTask({ id: "t1" });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-31" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ occurrenceId: "t1", date: "2026-08-03", isRecurring: false, completed: false });
  });

  it("excludes a one-off task outside the requested range", () => {
    const task = baseTask({ id: "t1", date: "2026-09-01" });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-31" });
    expect(result).toHaveLength(0);
  });
});

describe("getOccurrencesForRange — daily", () => {
  it("generates one occurrence per day in range", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ type: "daily", weekdays: [] }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-03", rangeEnd: "2026-08-09" });
    expect(result.map((o) => o.date)).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09",
    ]);
  });
});

describe("getOccurrencesForRange — weekly custom weekdays", () => {
  it("generates only occurrences on the selected weekdays", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-14" });
    // Mon/Wed/Fri in that window: Aug 3, 5, 7, 10, 12, 14
    expect(result.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-05", "2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14"]);
  });

  it("never generates an occurrence before recurrence.startsOn even if the range starts earlier", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ startsOn: "2026-08-05" }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-07" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-05", "2026-08-07"]);
  });

  it("stops at the first matching weekday on/after startsOn when startsOn itself isn't a selected weekday", () => {
    // startsOn is a Tuesday (2026-08-04), rule only fires Mon/Wed/Fri — first real occurrence is Wed 08-05.
    const task = baseTask({ id: "s1", seriesId: "s1", date: "2026-08-04", recurrence: weeklyRule({ startsOn: "2026-08-04" }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-07" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-05", "2026-08-07"]);
  });
});

describe("getOccurrencesForRange — ends on_date", () => {
  it("stops generating occurrences after `until`", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ ends: "on_date", until: "2026-08-07" }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-31" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  it("`until` is inclusive", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ type: "daily", weekdays: [], ends: "on_date", until: "2026-08-05" }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-03", rangeEnd: "2026-08-31" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });
});

describe("getOccurrencesForRange — exceptions", () => {
  it("omits a deleted occurrence", () => {
    const task = baseTask({
      id: "s1",
      seriesId: "s1",
      recurrence: weeklyRule(),
      exceptions: [{ occurrenceDate: "2026-08-05", kind: "deleted" }],
    });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-03", rangeEnd: "2026-08-07" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-07"]);
  });

  it("applies field overrides for an edited occurrence without affecting other occurrences", () => {
    const task = baseTask({
      id: "s1",
      seriesId: "s1",
      recurrence: weeklyRule(),
      exceptions: [{ occurrenceDate: "2026-08-05", kind: "edited", overrides: { title: "Guitar recital prep", duration: 60 } }],
    });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-03", rangeEnd: "2026-08-07" });
    const edited = result.find((o) => o.date === "2026-08-05")!;
    const unedited = result.find((o) => o.date === "2026-08-03")!;
    expect(edited.title).toBe("Guitar recital prep");
    expect(edited.duration).toBe(60);
    expect(unedited.title).toBe("Practice guitar");
    expect(unedited.duration).toBe(30);
  });
});

describe("getOccurrencesForRange — completion is per-occurrence", () => {
  it("only the completed occurrence date is marked completed, the rest stay incomplete", () => {
    const task = baseTask({
      id: "s1",
      seriesId: "s1",
      recurrence: weeklyRule(),
      completions: [{ occurrenceDate: "2026-08-05", completedAt: "2026-08-05T18:30:00.000Z" }],
    });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-03", rangeEnd: "2026-08-07" });
    expect(result.find((o) => o.date === "2026-08-03")!.completed).toBe(false);
    expect(result.find((o) => o.date === "2026-08-05")!.completed).toBe(true);
    expect(result.find((o) => o.date === "2026-08-07")!.completed).toBe(false);
  });
});

describe("getOccurrencesForRange — bounded generation", () => {
  it("never generates occurrences outside the requested range even for an endless rule spanning years", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ type: "daily", weekdays: [], startsOn: "2020-01-01" }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-07" });
    expect(result).toHaveLength(7);
    expect(result[0].date).toBe("2026-08-01");
    expect(result[result.length - 1].date).toBe("2026-08-07");
  });

  it("crosses a month boundary correctly", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ type: "daily", weekdays: [] }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-29", rangeEnd: "2026-09-02" });
    expect(result.map((o) => o.date)).toEqual(["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("crosses a year boundary correctly", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule({ type: "daily", weekdays: [] }) });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-12-30", rangeEnd: "2027-01-02" });
    expect(result.map((o) => o.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("getOccurrencesForRange — stable occurrence ids, no duplicates", () => {
  it("produces a unique, stable occurrenceId per occurrence", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const result = getOccurrencesForRange({ tasks: [task], rangeStart: "2026-08-01", rangeEnd: "2026-08-14" });
    const ids = result.map((o) => o.occurrenceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("s1:2026-08-03");
  });
});

describe("firstOccurrenceDate", () => {
  it("returns the task's own date for a one-off task", () => {
    expect(firstOccurrenceDate(baseTask({ id: "t1" }))).toBe("2026-08-03");
  });

  it("returns startsOn when it matches a selected weekday", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    expect(firstOccurrenceDate(task)).toBe("2026-08-03");
  });

  it("returns the first matching weekday after startsOn when startsOn doesn't match", () => {
    const task = baseTask({ id: "s1", seriesId: "s1", date: "2026-08-04", recurrence: weeklyRule({ startsOn: "2026-08-04" }) });
    expect(firstOccurrenceDate(task)).toBe("2026-08-05");
  });
});

function occurrenceOf(task: Task, date: string): Occurrence {
  const seriesId = task.seriesId ?? task.id;
  return {
    occurrenceId: `${seriesId}:${date}`,
    task,
    date,
    title: task.title,
    type: task.type,
    time: task.time,
    duration: task.duration,
    completed: false,
    isRecurring: true,
  };
}

let idCounter = 0;
function deterministicNewId(): string {
  idCounter += 1;
  return `new-id-${idCounter}`;
}

describe("applyOccurrenceEdit — scope 'this'", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("adds a deleted exception on the series and appends a new one-off task with the edited fields", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceEdit(
      [series],
      occurrence,
      "this",
      { title: "Extra practice", type: "hobby", time: "19:00", duration: 45 },
      deterministicNewId
    );

    const updatedSeries = result.find((t) => t.id === "s1")!;
    expect(updatedSeries.exceptions).toEqual([{ occurrenceDate: "2026-08-05", kind: "deleted" }]);

    const replacement = result.find((t) => t.id === "new-id-1")!;
    expect(replacement).toMatchObject({ title: "Extra practice", time: "19:00", duration: 45, date: "2026-08-05" });
    expect(replacement.recurrence).toBeUndefined();
    expect(replacement.seriesId).toBeUndefined();
  });

  it("does not affect other occurrences of the same series", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceEdit([series], occurrence, "this", { title: "Extra practice", type: "hobby", time: "19:00", duration: 45 }, deterministicNewId);
    const stillGenerated = getOccurrencesForRange({ tasks: result, rangeStart: "2026-08-03", rangeEnd: "2026-08-07" });
    expect(stillGenerated.map((o) => o.date).sort()).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
    expect(stillGenerated.find((o) => o.date === "2026-08-05")!.title).toBe("Extra practice");
    expect(stillGenerated.find((o) => o.date === "2026-08-03")!.title).toBe("Practice guitar");
  });
});

describe("applyOccurrenceEdit — scope 'following'", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("truncates the old series before the split date and starts a new series from it", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-07"); // third occurrence (Mon/Wed/Fri)
    const result = applyOccurrenceEdit([series], occurrence, "following", { title: "New time", type: "hobby", time: "20:00", duration: 30 }, deterministicNewId);

    const oldSeries = result.find((t) => t.id === "s1")!;
    expect(oldSeries.recurrence).toMatchObject({ ends: "on_date", until: "2026-08-06" });

    const newSeries = result.find((t) => t.id === "new-id-1")!;
    expect(newSeries.seriesId).toBe("new-id-1");
    expect(newSeries.title).toBe("New time");
    expect(newSeries.recurrence).toMatchObject({ startsOn: "2026-08-07", weekdays: [1, 3, 5] });

    const generated = getOccurrencesForRange({ tasks: result, rangeStart: "2026-08-01", rangeEnd: "2026-08-14" });
    // Old series: Aug 3, 5 only (truncated before Aug 7). New series: Aug 7, 10, 12, 14 with the new title.
    expect(generated.filter((o) => o.title === "Practice guitar").map((o) => o.date)).toEqual(["2026-08-03", "2026-08-05"]);
    expect(generated.filter((o) => o.title === "New time").map((o) => o.date)).toEqual(["2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14"]);
  });

  it("applies a newRule override to the new series' weekday pattern, not just its startsOn", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() }); // Mon/Wed/Fri
    const occurrence = occurrenceOf(series, "2026-08-07");
    const newWeekdays = weeklyRule({ weekdays: [2, 4] }); // switch to Tue/Thu going forward
    const result = applyOccurrenceEdit([series], occurrence, "following", { title: "Practice guitar", type: "hobby", time: "18:00", duration: 30 }, deterministicNewId, newWeekdays);
    const newSeries = result.find((t) => t.id === "new-id-1")!;
    expect(newSeries.recurrence).toMatchObject({ startsOn: "2026-08-07", weekdays: [2, 4] });
  });

  it("degrades to editing the whole series when the split point is the first occurrence", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-03"); // first occurrence
    const result = applyOccurrenceEdit([series], occurrence, "following", { title: "New title", type: "hobby", time: "20:00", duration: 30 }, deterministicNewId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "s1", title: "New title" });
  });

  it("newRule=null splits off a plain one-off (no recurrence/seriesId) instead of a new series, in one atomic transform", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-07"); // not the first occurrence
    const result = applyOccurrenceEdit([series], occurrence, "following", { title: "One-off now", type: "task", time: "09:00", duration: 15 }, deterministicNewId, null);

    const oldSeries = result.find((t) => t.id === "s1")!;
    expect(oldSeries.recurrence).toMatchObject({ ends: "on_date", until: "2026-08-06" });

    const newOneOff = result.find((t) => t.id === "new-id-1")!;
    expect(newOneOff).toMatchObject({ title: "One-off now", type: "task", date: "2026-08-07", time: "09:00", duration: 15 });
    expect(newOneOff.recurrence).toBeUndefined();
    expect(newOneOff.seriesId).toBeUndefined();
  });

  it("newRule=null on the first occurrence collapses the whole series into a single non-recurring task", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule(), exceptions: [{ occurrenceDate: "2026-08-05", kind: "deleted" }] });
    const occurrence = occurrenceOf(series, "2026-08-03"); // first occurrence
    const result = applyOccurrenceEdit([series], occurrence, "following", { title: "New title", type: "hobby", time: "20:00", duration: 30 }, deterministicNewId, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "s1", title: "New title" });
    expect(result[0].recurrence).toBeUndefined();
    expect(result[0].seriesId).toBeUndefined();
    expect(result[0].exceptions).toBeUndefined();
  });
});

describe("applyOccurrenceEdit — scope 'all'", () => {
  it("updates the base record in place, no new series created", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceEdit([series], occurrence, "all", { title: "Renamed", type: "task", time: "07:00", duration: 20 }, deterministicNewId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "s1", title: "Renamed", type: "task", time: "07:00", duration: 20 });
    expect(result[0].recurrence).toEqual(series.recurrence);
  });

  it("replaces the recurrence rule in place when newRule is given", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const newRule = weeklyRule({ ends: "on_date", until: "2026-12-31" });
    const result = applyOccurrenceEdit([series], occurrence, "all", { title: "Practice guitar", type: "hobby", time: "18:00", duration: 30 }, deterministicNewId, newRule);
    expect(result[0].recurrence).toEqual(newRule);
  });
});

describe("applyOccurrenceDelete", () => {
  it("scope 'this' adds a deleted exception without removing the base record", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceDelete([series], occurrence, "this");
    expect(result).toHaveLength(1);
    expect(result[0].exceptions).toEqual([{ occurrenceDate: "2026-08-05", kind: "deleted" }]);
    const generated = getOccurrencesForRange({ tasks: result, rangeStart: "2026-08-03", rangeEnd: "2026-08-07" });
    expect(generated.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-07"]);
  });

  it("scope 'following' truncates the series before the target date", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-07");
    const result = applyOccurrenceDelete([series], occurrence, "following");
    const generated = getOccurrencesForRange({ tasks: result, rangeStart: "2026-08-01", rangeEnd: "2026-08-14" });
    expect(generated.map((o) => o.date)).toEqual(["2026-08-03", "2026-08-05"]);
  });

  it("scope 'following' removes the whole series when the target is the first occurrence", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const occurrence = occurrenceOf(series, "2026-08-03");
    const result = applyOccurrenceDelete([series], occurrence, "following");
    expect(result).toHaveLength(0);
  });

  it("scope 'series' removes the whole base record", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const other = baseTask({ id: "t2", date: "2026-08-10" });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceDelete([series, other], occurrence, "series");
    expect(result).toEqual([other]);
  });

  it("deleting one occurrence does not affect an unrelated series or one-off task", () => {
    const series = baseTask({ id: "s1", seriesId: "s1", recurrence: weeklyRule() });
    const other = baseTask({ id: "t2", date: "2026-08-05" });
    const occurrence = occurrenceOf(series, "2026-08-05");
    const result = applyOccurrenceDelete([series, other], occurrence, "this");
    const untouchedOther = result.find((t) => t.id === "t2")!;
    expect(untouchedOther).toEqual(other);
  });
});
