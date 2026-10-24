import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localTimeIn, monthKeyIn, todayIn } from "@/lib/time";

describe("todayIn", () => {
  it("uses the home timezone, not UTC", () => {
    expect(todayIn("Europe/Madrid", new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
  });

  it("handles the DST change day", () => {
    expect(todayIn("Europe/Madrid", new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29");
  });

  it("defaults now to the current time", () => {
    expect(todayIn("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("localTimeIn", () => {
  it("returns a zero-padded 24h HH:MM in the home timezone", () => {
    expect(localTimeIn("Europe/Madrid", new Date("2026-10-24T06:05:00Z"))).toBe("08:05");
  });

  it("returns 00:xx at local midnight, never 24:xx", () => {
    expect(localTimeIn("Europe/Madrid", new Date("2026-10-24T22:00:00Z"))).toBe("00:00");
  });
});

describe("monthKeyIn", () => {
  it("returns YYYY-MM in the home timezone", () => {
    expect(monthKeyIn("Europe/Madrid", new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
});

describe("addDays", () => {
  it("adds calendar days across a month boundary", () => {
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
  });

  it("handles negative offsets and leap days", () => {
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("returns b minus a in calendar days", () => {
    expect(daysBetween("2026-10-24", "2026-11-08")).toBe(15);
    expect(daysBetween("2026-11-08", "2026-10-24")).toBe(-15);
  });

  it("is not shifted by the DST change", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});
