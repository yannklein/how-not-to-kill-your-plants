import { describe, expect, it } from "vitest";
import { mockIdentify, mockProfile } from "@/lib/ai/mock";
import {
  CareProfile,
  checkCareProfile,
  IdentifyResult,
  normalizeScientificName,
} from "@/lib/ai/schemas";

describe("normalizeScientificName", () => {
  it("strips cultivar quotes", () => {
    expect(normalizeScientificName("Ficus elastica 'Tineke'")).toBe("ficus elastica");
  });
  it("collapses spaces and lowercases", () => {
    expect(normalizeScientificName("  Strelitzia   NICOLAI ")).toBe("strelitzia nicolai");
  });
  it("drops var./cv. suffixes", () => {
    expect(normalizeScientificName("Epipremnum aureum var. marble queen")).toBe("epipremnum aureum");
    expect(normalizeScientificName("Monstera deliciosa cv. Thai")).toBe("monstera deliciosa");
  });
});

describe("schemas", () => {
  it("accepts the mock profile and identify fixture", () => {
    expect(CareProfile.parse(mockProfile)).toBeTruthy();
    expect(IdentifyResult.parse(mockIdentify).candidates[0].confidence).toBe(0.92);
    expect(mockProfile.waterIntervalDays.growing).toEqual({ min: 7, max: 10 });
    expect(mockProfile.waterIntervalDays.dormant).toEqual({ min: 10, max: 14 });
  });
  it("rejects a profile missing pt-BR text", () => {
    const text = { en: mockProfile.text.en, fr: mockProfile.text.fr };
    expect(CareProfile.safeParse({ ...mockProfile, text }).success).toBe(false);
  });
  it("checkCareProfile rejects inverted ranges", () => {
    expect(() =>
      checkCareProfile({ ...mockProfile, tempC: { min: 30, max: 10 } }),
    ).toThrow();
  });
});
