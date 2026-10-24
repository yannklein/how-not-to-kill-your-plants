import { describe, expect, it } from "vitest";
import { mockProfile as pilea } from "@/lib/ai/mock";
import { EMPTY_WATER_STATE, baseInterval, nextWater } from "@/lib/care/watering";

const common = { profile: pilea, season: "autumn" as const, overrideDays: null };

describe("adaptive watering", () => {
  it("learns from a still_moist then done cycle", () => {
    const a = nextWater({ ...common, today: "2026-10-24", outcome: "done", state: EMPTY_WATER_STATE });
    expect(a.dueOn).toBe("2026-11-05");

    const b = nextWater({ ...common, today: "2026-11-05", outcome: "still_moist", state: a.state });
    expect(b.dueOn).toBe("2026-11-08");
    expect(b.state.moistCount).toBe(1);

    const c = nextWater({ ...common, today: "2026-11-08", outcome: "done", state: b.state });
    expect(c.state.learned.dormant).toBe(14);
    expect(c.state.learned.growing).toBeNull();
    expect(c.state.moistCount).toBe(0);
    expect(c.dueOn).toBe("2026-11-22");

    const d = nextWater({ ...common, today: "2026-11-22", outcome: "skipped", state: c.state });
    expect(d.dueOn).toBe("2026-11-23");
    expect(d.state).toEqual(c.state);
  });

  it("override wins over learned and profile values", () => {
    const r = nextWater({
      ...common,
      overrideDays: 9,
      today: "2026-10-24",
      outcome: "done",
      state: EMPTY_WATER_STATE,
    });
    expect(r.dueOn).toBe("2026-11-02");
  });

  it("baseInterval: override, learned, then midpoint", () => {
    const learned = { ...EMPTY_WATER_STATE, learned: { growing: 8, dormant: null } };
    expect(baseInterval(pilea, "summer", learned, null)).toBe(8);
    expect(baseInterval(pilea, "winter", learned, null)).toBe(12);
    expect(baseInterval(pilea, "summer", learned, 5)).toBe(5);
  });

  it("clamps the learned value to 1.5x the range max", () => {
    const state = { ...EMPTY_WATER_STATE, lastWateredOn: "2026-01-01", moistCount: 1 };
    const r = nextWater({ ...common, today: "2026-10-24", outcome: "done", state });
    expect(r.state.learned.dormant).toBe(21);
  });
});
