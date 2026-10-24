import { describe, expect, it } from "vitest";
import { moodOf } from "@/lib/feed/mood";

const today = "2026-11-10";
const water = (dueOn: string) => ({ type: "water" as const, dueOn, active: true });

describe("moodOf", () => {
  it("sulks when a counted task is more than 3 days overdue", () => {
    expect(moodOf({ today, season: "autumn", tasks: [water("2026-11-06")], lastMomentOn: null })).toBe("sulking");
  });
  it("is needy when a counted task is due or up to 3 days overdue", () => {
    expect(moodOf({ today, season: "autumn", tasks: [water("2026-11-07")], lastMomentOn: null })).toBe("needy");
  });
  it("ignores photo tasks: sleepy in autumn, happy in summer", () => {
    const tasks = [{ type: "photo" as const, dueOn: "2026-11-01", active: true }];
    expect(moodOf({ today, season: "autumn", tasks, lastMomentOn: null })).toBe("sleepy");
    expect(moodOf({ today, season: "summer", tasks, lastMomentOn: null })).toBe("happy");
  });
  it("is proud for 3 days after a moment, even when overdue", () => {
    expect(moodOf({ today, season: "autumn", tasks: [water("2026-10-31")], lastMomentOn: "2026-11-08" })).toBe("proud");
  });
  it("is sleepy in the dormant season and happy in the growing one when nothing is due", () => {
    expect(moodOf({ today, season: "winter", tasks: [water("2026-11-20")], lastMomentOn: null })).toBe("sleepy");
    expect(moodOf({ today, season: "spring", tasks: [water("2026-11-20")], lastMomentOn: null })).toBe("happy");
  });
  it("ignores inactive tasks", () => {
    const tasks = [{ type: "water" as const, dueOn: "2026-11-01", active: false }];
    expect(moodOf({ today, season: "spring", tasks, lastMomentOn: null })).toBe("happy");
  });
});
