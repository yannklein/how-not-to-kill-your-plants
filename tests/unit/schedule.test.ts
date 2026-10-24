import { describe, expect, it } from "vitest";
import { mockProfile as pilea } from "@/lib/ai/mock";
import { initialTasks, nextDue } from "@/lib/care/schedule";

describe("initialTasks", () => {
  it("schedules a just-bought plant", () => {
    const tasks = initialTasks({
      today: "2026-10-24",
      acquiredOn: "2026-10-24",
      justBought: true,
      profile: pilea,
      hemisphere: "N",
    });
    const due = (t: string) => tasks.find((x) => x.type === t)?.dueOn;
    expect(due("water")).toBe("2026-10-27");
    expect(due("settle_check")).toBe("2026-11-07");
    expect(due("fertilize")).toBe("2027-03-01");
    expect(due("repot")).toBeUndefined();
    expect(due("mist")).toBeUndefined();
  });

  it("schedules an established plant", () => {
    const tasks = initialTasks({
      today: "2026-06-01",
      acquiredOn: "2025-01-01",
      justBought: false,
      profile: { ...pilea, mistEveryDays: 5 },
      hemisphere: "N",
    });
    const due = (t: string) => tasks.find((x) => x.type === t)?.dueOn;
    expect(due("water")).toBe("2026-06-02");
    expect(due("settle_check")).toBeUndefined();
    expect(due("repot")).toBe("2027-03-15");
    expect(due("fertilize")).toBe("2026-07-01");
    expect(due("mist")).toBe("2026-06-06");
  });
});

describe("nextDue", () => {
  const base = { profile: pilea, hemisphere: "N" as const };

  it("settle_check rootbound_no spawns a spring repot", () => {
    expect(
      nextDue({ ...base, type: "settle_check", outcome: "rootbound_no", today: "2026-11-07" }),
    ).toEqual({ dueOn: null, spawn: { type: "repot", dueOn: "2027-03-15" } });
  });

  it("settle_check rootbound_yes spawns a repot in 3 days", () => {
    expect(
      nextDue({ ...base, type: "settle_check", outcome: "rootbound_yes", today: "2026-11-07" }),
    ).toEqual({ dueOn: null, spawn: { type: "repot", dueOn: "2026-11-10" } });
  });

  it("fertilize pauses outside the growing season", () => {
    const p = { ...pilea, fertilizeEveryDays: 30 };
    expect(nextDue({ ...base, profile: p, type: "fertilize", outcome: "done", today: "2027-08-20" }).dueOn).toBe("2028-03-01");
    expect(nextDue({ ...base, profile: p, type: "fertilize", outcome: "done", today: "2027-05-20" }).dueOn).toBe("2027-06-19");
  });

  it("repot done waits for the spring two months before the interval", () => {
    const p = { ...pilea, repotEveryMonths: 24 };
    expect(nextDue({ ...base, profile: p, type: "repot", outcome: "done", today: "2027-03-20" }).dueOn).toBe("2029-03-15");
    expect(nextDue({ ...base, profile: p, type: "repot", outcome: "skipped", today: "2027-03-20" }).dueOn).toBe("2028-03-15");
  });

  it("rotate and dust repeat on their interval; water delegates", () => {
    expect(nextDue({ ...base, type: "rotate", outcome: "skipped", today: "2026-10-24" }).dueOn).toBe("2026-10-31");
    expect(nextDue({ ...base, type: "dust", outcome: "done", today: "2026-10-24" }).dueOn).toBe("2026-11-23");
    expect(nextDue({ ...base, type: "water", outcome: "done", today: "2026-10-24" }).dueOn).toBe("2026-11-05");
  });
});

describe("monthly portrait task", () => {
  it("is part of the initial tasks, due a month later", () => {
    const tasks = initialTasks({
      today: "2026-10-25",
      acquiredOn: "2026-10-25",
      justBought: true,
      profile: pilea,
      hemisphere: "N",
    });
    expect(tasks.find((t) => t.type === "photo")?.dueOn).toBe("2026-11-25");
  });

  it("comes back a month after it is done or skipped", () => {
    for (const outcome of ["done", "skipped"] as const) {
      const next = nextDue({ type: "photo", outcome, today: "2026-11-25", profile: pilea, hemisphere: "N" });
      expect(next.dueOn).toBe("2026-12-25");
    }
  });
});
