import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { species } from "@/db/schema";
import { env } from "@/lib/env";
import { withBudget } from "./budget";
import { getClient } from "./client";
import { mockProfile, MOCK_USAGE } from "./mock";
import type { Usage } from "./pricing";
import { CareProfile, checkCareProfile, normalizeScientificName } from "./schemas";

const MODEL = "claude-sonnet-5-5" as const;
export const MAX_PROFILE_ATTEMPTS = 3;

// Stable prefix: no dates, no user data, no home location (cached).
export const CARE_PROFILE_SYSTEM_PROMPT = `You write care profiles for indoor houseplants for a small household plant-care app.

Rules:
- Describe care for the plant as an indoor houseplant in a typical apartment.
- Fertilizer and remedy suggestions must be organic or non-chemical first (compost, worm castings, seaweed extract, neem, soap sprays, manual removal). Never recommend synthetic fertilizers or chemical pesticides.
- Watering intervals are in days, separately for the growing season and the dormant season. Use realistic ranges where min is at most max.
- Intervals (repotting in months; fertilizing, rotating, dusting in days) must be positive. Use null for mistEveryDays when misting is not useful for this plant.
- Fill the text object for all three locales: en (English), fr (French) and pt-BR (Brazilian Portuguese). Each has a short summary, a soil mix, a list of organic fertilizers, a list of common problems with organic remedies, and a toxicity note for cats, dogs and people.
- Scientific names stay in Latin in every locale.`;

export type Species = typeof species.$inferSelect;

export async function getOrCreateSpecies(
  scientificName: string,
  commonName: string,
): Promise<Species> {
  const key = normalizeScientificName(scientificName);
  const [row] = await db
    .insert(species)
    .values({ scientificNameKey: key, scientificName, commonNames: { en: commonName } })
    .onConflictDoUpdate({
      target: species.scientificNameKey,
      // no-op update so RETURNING yields the existing row
      set: { scientificNameKey: key },
    })
    .returning();
  return row;
}

type Generated = { result: CareProfile; usage: Usage };
export type CareProfileDeps = {
  /** Test seam: replaces the model call (and mock-mode fixture). */
  generate?: (sp: Species) => Promise<Generated>;
};

async function generateLive(sp: Species): Promise<Generated> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: "text", text: CARE_PROFILE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Write the care profile for: ${sp.scientificName}.`,
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(CareProfile) },
  });
  if (response.stop_reason === "refusal" || response.parsed_output == null) {
    throw new Error("Care profile generation was refused or returned no output");
  }
  return { result: response.parsed_output, usage: response.usage };
}

async function generateMock(): Promise<Generated> {
  return { result: mockProfile, usage: MOCK_USAGE };
}

export async function ensureCareProfile(
  speciesId: string,
  deps: CareProfileDeps = {},
): Promise<"ready" | "failed"> {
  const generate = deps.generate ?? (env.AI_MODE === "mock" ? generateMock : generateLive);

  for (;;) {
    const [sp] = await db.select().from(species).where(eq(species.id, speciesId));
    if (!sp) throw new Error(`Species ${speciesId} not found`);
    if (sp.careProfileStatus === "ready") return "ready";
    if (sp.careProfileStatus === "failed" || sp.profileAttempts >= MAX_PROFILE_ATTEMPTS) {
      return "failed";
    }

    try {
      const profile = await withBudget("care_profile", null, MODEL, async () => {
        const out = await generate(sp);
        checkCareProfile(CareProfile.parse(out.result));
        return out;
      });
      // Conditional on not-yet-ready so a concurrent winner is not overwritten.
      await db
        .update(species)
        .set({ careProfile: profile, careProfileStatus: "ready" })
        .where(sql`${species.id} = ${speciesId} and ${species.careProfileStatus} <> 'ready'`);
      return "ready";
    } catch {
      await db
        .update(species)
        .set({
          profileAttempts: sql`${species.profileAttempts} + 1`,
          careProfileStatus: sql`case when ${species.profileAttempts} + 1 >= ${MAX_PROFILE_ATTEMPTS} then 'failed' else 'pending' end`,
        })
        .where(eq(species.id, speciesId));
    }
  }
}
