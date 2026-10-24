import { afterEach, describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/calendar/ics";

const base = {
  userId: "u1",
  today: "2026-10-25",
  tz: "Europe/Madrid",
  appUrl: "http://localhost:3000",
  tasks: [
    { plantName: "Pilea", type: "water" as const, dueOn: "2026-10-20" },
    { plantName: "Pachira", type: "water" as const, dueOn: "2026-10-25" },
    { plantName: "Strelitzia", type: "rotate" as const, dueOn: "2026-10-25" },
    { plantName: "Pilea", type: "dust" as const, dueOn: "2027-01-30" },
  ],
};

// Unfold RFC 5545 line folding.
const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, "");

describe("buildIcs", () => {
  it("emits one all-day event per day, overdue mapped to today, beyond horizon dropped", () => {
    const ics = unfold(buildIcs({ ...base, locale: "en" }));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
    expect(ics).toContain("UID:u1-2026-10-25@plants");
    expect(ics).toContain("SUMMARY:🌿 Water Pilea & Pachira · Rotate Strelitzia");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H");
    expect(ics).toContain("X-WR-CALNAME:My plants");
  });

  it("localizes the verbs", () => {
    const ics = unfold(buildIcs({ ...base, locale: "fr" }));
    expect(ics).toContain("Arroser Pilea & Pachira");
  });

  it("includes tasks on the horizon day (today+60) and lists one task per line", () => {
    const ics = unfold(
      buildIcs({
        ...base,
        locale: "en",
        tasks: [
          { plantName: "A", type: "water", dueOn: "2026-12-24" },
          { plantName: "B", type: "water", dueOn: "2026-12-24" },
          { plantName: "C", type: "water", dueOn: "2026-12-24" },
          { plantName: "D", type: "water", dueOn: "2026-12-25" },
        ],
      }),
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("Water A\\, B & C");
    expect(ics).toContain("DESCRIPTION:Water A\\nWater B\\nWater C");
  });

  describe("under a negative-offset process timezone", () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it.each(["America/Los_Angeles", "America/Sao_Paulo"])("keeps the date under TZ=%s", (zone) => {
      process.env.TZ = zone;
      // Guard: the runtime really switched timezone (local midnight is not UTC midnight).
      expect(new Date("2026-10-25T00:00:00Z").getDate()).toBe(24);
      const ics = unfold(buildIcs({ ...base, locale: "en" }));
      expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
      expect(ics).not.toContain("DTSTART;VALUE=DATE:20261024");
    });
  });
});
