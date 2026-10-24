import { z } from "zod";

// Structured outputs do not support numeric bounds or array length limits, so
// those are enforced after parsing (see `checkCareProfile`, `trimIdentify`).

export const IdentifyResult = z.object({
  isPlant: z.boolean(),
  candidates: z.array(
    z.object({
      scientificName: z.string(),
      commonName: z.string(),
      confidence: z.number(),
    }),
  ),
  labelText: z.string().nullable(),
  potSizeCm: z.number().nullable(),
  suggestedNames: z.array(z.string()),
  persona: z.object({ summary: z.string(), traits: z.array(z.string()) }),
});
export type IdentifyResult = z.infer<typeof IdentifyResult>;

/** Enforce the limits structured outputs cannot express: max 3 candidates, 3 names/traits. */
export function trimIdentify(r: IdentifyResult): IdentifyResult {
  return {
    ...r,
    candidates: r.candidates
      .map((c) => ({ ...c, confidence: Math.min(1, Math.max(0, c.confidence)) }))
      .slice(0, 3),
    suggestedNames: r.suggestedNames.slice(0, 3),
    persona: { ...r.persona, traits: r.persona.traits.slice(0, 3) },
  };
}

export const NOT_A_PLANT: IdentifyResult = {
  isPlant: false,
  candidates: [],
  labelText: null,
  potSizeCm: null,
  suggestedNames: [],
  persona: { summary: "", traits: [] },
};

const Range = z.object({ min: z.number(), max: z.number() });

const LocaleText = z.object({
  summary: z.string(),
  soilMix: z.string(),
  organicFertilizers: z.array(z.string()),
  commonProblems: z.array(z.string()),
  toxicity: z.string(),
});

export const CareProfile = z.object({
  light: z.enum(["low", "medium", "bright_indirect", "direct"]),
  waterIntervalDays: z.object({ growing: Range, dormant: Range }),
  humidity: z.enum(["low", "medium", "high"]),
  tempC: Range,
  repotEveryMonths: z.number(),
  fertilizeEveryDays: z.number(),
  rotateEveryDays: z.number(),
  dustEveryDays: z.number(),
  mistEveryDays: z.number().nullable(),
  text: z.object({ en: LocaleText, fr: LocaleText, "pt-BR": LocaleText }),
});
export type CareProfile = z.infer<typeof CareProfile>;

const wholeDays = (n: number): number => Math.max(1, Math.round(n));

/**
 * Post-parse sanity checks for what the structured-output schema cannot enforce.
 * Throws on invalid input; returns the profile with every interval rounded to a
 * whole number >= 1 (the model sometimes answers 0.5 or 10.5).
 */
export function checkCareProfile(p: CareProfile): CareProfile {
  const ranges = [p.waterIntervalDays.growing, p.waterIntervalDays.dormant, p.tempC];
  for (const r of ranges) {
    if (!(r.min <= r.max)) throw new Error("Care profile range has min > max");
  }
  const positives = [
    p.waterIntervalDays.growing.min,
    p.waterIntervalDays.dormant.min,
    p.repotEveryMonths,
    p.fertilizeEveryDays,
    p.rotateEveryDays,
    p.dustEveryDays,
  ];
  if (positives.some((n) => !(n > 0))) throw new Error("Care profile interval must be positive");
  if (p.mistEveryDays !== null && !(p.mistEveryDays > 0)) {
    throw new Error("Care profile mist interval must be positive");
  }
  const water = p.waterIntervalDays;
  return {
    ...p,
    waterIntervalDays: {
      growing: { min: wholeDays(water.growing.min), max: wholeDays(water.growing.max) },
      dormant: { min: wholeDays(water.dormant.min), max: wholeDays(water.dormant.max) },
    },
    repotEveryMonths: wholeDays(p.repotEveryMonths),
    fertilizeEveryDays: wholeDays(p.fertilizeEveryDays),
    rotateEveryDays: wholeDays(p.rotateEveryDays),
    dustEveryDays: wholeDays(p.dustEveryDays),
    mistEveryDays: p.mistEveryDays === null ? null : wholeDays(p.mistEveryDays),
  };
}

/** Lowercase genus + species, without cultivar quotes, var./cv. suffixes or spacing noise. */
export function normalizeScientificName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/['"‘’“”][^'"‘’“”]*['"‘’“”]/g, " ")
    .replace(/\b(var|cv|subsp|ssp|f)\.?\s.*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").slice(0, 2).join(" ");
}
