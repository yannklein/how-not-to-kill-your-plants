import { describe, expect, it } from "vitest";
import { birthdayKind, joinedOn } from "@/lib/feed/birthdays";

describe("birthdayKind", () => {
  it("celebrates one month, then every year", () => {
    expect(birthdayKind("2026-10-24", "2026-11-24")).toEqual({ kind: "month", years: 0 });
    expect(birthdayKind("2026-10-24", "2027-10-24")).toEqual({ kind: "year", years: 1 });
    expect(birthdayKind("2026-10-24", "2028-10-24")).toEqual({ kind: "year", years: 2 });
  });
  it("is null on other days, including the join day itself", () => {
    expect(birthdayKind("2026-10-24", "2026-11-25")).toBeNull();
    expect(birthdayKind("2026-10-24", "2026-10-24")).toBeNull();
  });
  it("celebrates a 29 February join on 28 February in non-leap years", () => {
    expect(birthdayKind("2028-02-29", "2029-02-28")).toEqual({ kind: "year", years: 1 });
  });
});

describe("joinedOn", () => {
  it("uses the home timezone day (23:30 UTC is already the next day in Madrid)", () => {
    expect(joinedOn(new Date("2026-10-24T23:30:00Z"), "Europe/Madrid")).toBe("2026-10-25");
  });
});
