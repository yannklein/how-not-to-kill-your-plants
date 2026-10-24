import { describe, expect, it } from "vitest";
import { isGrowing, nextGrowingStart, nextSpringDay, seasonOf } from "@/lib/care/season";

describe("seasonOf", () => {
  it("maps northern hemisphere months to seasons", () => {
    expect(seasonOf("2026-03-01", "N")).toBe("spring");
    expect(seasonOf("2026-05-31", "N")).toBe("spring");
    expect(seasonOf("2026-06-01", "N")).toBe("summer");
    expect(seasonOf("2026-08-31", "N")).toBe("summer");
    expect(seasonOf("2026-09-01", "N")).toBe("autumn");
    expect(seasonOf("2026-11-30", "N")).toBe("autumn");
    expect(seasonOf("2026-12-01", "N")).toBe("winter");
    expect(seasonOf("2027-02-28", "N")).toBe("winter");
  });

  it("shifts seasons by six months in the southern hemisphere", () => {
    expect(seasonOf("2026-10-24", "S")).toBe("spring");
    expect(seasonOf("2026-01-15", "S")).toBe("summer");
  });
});

describe("isGrowing", () => {
  it("is true for spring and summer only", () => {
    expect(isGrowing("spring")).toBe(true);
    expect(isGrowing("summer")).toBe(true);
    expect(isGrowing("autumn")).toBe(false);
    expect(isGrowing("winter")).toBe(false);
  });
});

describe("nextSpringDay", () => {
  it("returns the next MM-15 strictly after the given day (N)", () => {
    expect(nextSpringDay("2026-11-07", "N")).toBe("2027-03-15");
    expect(nextSpringDay("2027-03-15", "N")).toBe("2028-03-15");
    expect(nextSpringDay("2027-03-14", "N")).toBe("2027-03-15");
  });

  it("uses 09-15 for the southern hemisphere", () => {
    expect(nextSpringDay("2026-10-24", "S")).toBe("2027-09-15");
    expect(nextSpringDay("2026-09-15", "S")).toBe("2027-09-15");
  });
});

describe("nextGrowingStart", () => {
  it("returns the next MM-01 strictly after the given day (N)", () => {
    expect(nextGrowingStart("2026-10-24", "N")).toBe("2027-03-01");
    expect(nextGrowingStart("2027-03-01", "N")).toBe("2028-03-01");
  });

  it("uses 09-01 for the southern hemisphere", () => {
    expect(nextGrowingStart("2026-10-24", "S")).toBe("2027-09-01");
  });
});
