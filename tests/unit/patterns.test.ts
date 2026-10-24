import { describe, expect, it } from "vitest";
import type { TaskOutcome, TaskType } from "@/lib/care/types";
import { flagPatterns } from "@/lib/gardener/patterns";

const today = "2026-11-20";
const c = (taskType: TaskType, outcome: TaskOutcome, day = "2026-11-18") => ({ taskType, outcome, day });
const base = { today, completions: [], tasks: [], lastMood: null, lastMoodOn: null };
const rules = (flags: { rule: string; category: string }[]) => flags.map((f) => [f.rule, f.category]);

describe("flagPatterns", () => {
  it("flags soil that stays moist three times in a row", () => {
    const completions = [c("water", "still_moist"), c("water", "still_moist"), c("water", "still_moist")];
    expect(rules(flagPatterns({ ...base, completions }))).toEqual([["moist_streak", "overwatering"]]);
  });

  it("needs the moist answers to be consecutive", () => {
    const completions = [c("water", "still_moist"), c("water", "done"), c("water", "still_moist"), c("water", "still_moist")];
    expect(flagPatterns({ ...base, completions })).toEqual([]);
  });

  it("flags the same task skipped three times in a row", () => {
    const completions = [c("rotate", "skipped"), c("water", "done"), c("rotate", "skipped"), c("rotate", "skipped")];
    expect(rules(flagPatterns({ ...base, completions }))).toEqual([["skip_streak", "other"]]);
  });

  it("flags care more than a week overdue, water as underwatering", () => {
    const water = { type: "water" as const, dueOn: "2026-11-12", active: true };
    const fert = { type: "fertilize" as const, dueOn: "2026-11-12", active: true };
    expect(rules(flagPatterns({ ...base, tasks: [water] }))).toEqual([["overdue", "underwatering"]]);
    expect(rules(flagPatterns({ ...base, tasks: [fert] }))).toEqual([["overdue", "other"]]);
  });

  it("ignores old portrait reminders and inactive tasks", () => {
    const tasks = [
      { type: "photo" as const, dueOn: "2026-10-01", active: true },
      { type: "water" as const, dueOn: "2026-10-01", active: false },
    ];
    expect(flagPatterns({ ...base, tasks })).toEqual([]);
  });

  it("flags a plant sulking for more than a week", () => {
    expect(rules(flagPatterns({ ...base, lastMood: "sulking", lastMoodOn: "2026-11-12" }))).toEqual([["sulking", "other"]]);
    expect(flagPatterns({ ...base, lastMood: "sulking", lastMoodOn: "2026-11-15" })).toEqual([]);
    expect(flagPatterns({ ...base, lastMood: "happy", lastMoodOn: "2026-10-01" })).toEqual([]);
  });

  it("is quiet for a healthy history", () => {
    const completions = [c("water", "done"), c("water", "still_moist"), c("water", "done")];
    const tasks = [{ type: "water" as const, dueOn: "2026-11-22", active: true }];
    expect(flagPatterns({ ...base, completions, tasks, lastMood: "happy", lastMoodOn: "2026-11-01" })).toEqual([]);
  });
});
