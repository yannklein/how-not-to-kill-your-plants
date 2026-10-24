import { and, asc, desc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { careTask, home, photo, plant, spot, taskCompletion } from "@/db/schema";
import { withBudget } from "@/lib/ai/budget";
import { callStructured, type StructuredOutput } from "@/lib/ai/client";
import { MOCK_USAGE } from "@/lib/ai/mock";
import type { Mood } from "@/lib/feed/types";
import { env } from "@/lib/env";
import { getObjectBytes } from "@/lib/storage";
import { addDays, todayIn } from "@/lib/time";
import { createAlert } from "./alerts";
import { plantContext, type PlantContext } from "./context";
import { flagPatterns, type PatternFlag } from "./patterns";
import { ALERT_CATEGORIES, type Suggestion } from "./types";

const MODEL = "claude-sonnet-5-5" as const;
// Sonnet 5.5 thinks adaptively by default and thinking shares max_tokens with the answer.
const MAX_TOKENS = 16_000;
const PATTERN_EVERY_DAYS = 7;

export const HEALTH_CHECK_SYSTEM_PROMPT = `You are the gardener of a small household plant-care app: one calm, friendly expert. You check indoor houseplants in an apartment for health problems.

Rules:
- Report a problem only when it is visible in the photo or clearly implied by the care history. If unsure, report no problem.
- Never report "looks healthy" as a problem.
- Pick exactly one category: light, overwatering, underwatering, pests, nutrients, temperature, humidity, repot, other.
- Write the warning in English (en), French (fr) and Brazilian Portuguese (pt-BR): one or two calm, practical sentences saying what you see and what to do. Organic and non-chemical remedies first.
- Optionally propose ONE concrete change: a watering interval in days (1-60), or moving the plant to one of the given spots (use its id). Only propose a spot from the list.`;

export const HealthFinding = z.object({
  problem: z.boolean(),
  category: z.enum(ALERT_CATEGORIES),
  texts: z.object({ en: z.string(), fr: z.string(), "pt-BR": z.string() }),
  suggestion: z
    .union([
      z.object({ kind: z.literal("water"), days: z.number() }),
      z.object({ kind: z.literal("spot"), spotId: z.string() }),
    ])
    .nullable(),
});
type Finding = z.infer<typeof HealthFinding>;

export type CheckInput = {
  kind: "photo" | "pattern";
  plantName: string;
  context: PlantContext;
  spots: { id: string; name: string; lightLevel: string; windowDirection: string }[];
  flags: PatternFlag[];
  photoKeys: string[]; // newest first: the photo to check, then the previous one
};
export type CheckDeps = { call?: (input: CheckInput) => Promise<StructuredOutput> };

async function callLive(input: CheckInput): Promise<StructuredOutput> {
  const images = await Promise.all(
    input.photoKeys.map(async (key) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: (await getObjectBytes(key)).toString("base64") },
    })),
  );
  const facts = { ...input, photoKeys: undefined }; // the photos travel as images, not as keys
  return callStructured({
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: HEALTH_CHECK_SYSTEM_PROMPT,
    content: [
      ...images,
      {
        type: "text" as const,
        text:
          (input.kind === "photo"
            ? "Check this plant. The first photo is new; a second photo, if any, is the previous portrait.\n"
            : "Check this plant's recent care history; the flags are what the app noticed.\n") + JSON.stringify(facts),
      },
    ],
    schema: HealthFinding,
  });
}

/** Deterministic offline stand-in: a plant named "Sick…" has a light problem; a flagged pattern is reported as is. */
async function callMock(input: CheckInput): Promise<StructuredOutput> {
  const problem = input.kind === "photo" ? input.plantName.includes("Sick") : input.flags.length > 0;
  const category = input.kind === "photo" ? "light" : (input.flags[0]?.category ?? "other");
  const line = (l: string) => `[mock ${l}] ${input.plantName}: ${category}`;
  const output: Finding = {
    problem,
    category,
    texts: { en: line("en"), fr: line("fr"), "pt-BR": line("pt-BR") },
    suggestion: null,
  };
  return { output, refused: false, usage: MOCK_USAGE };
}

async function homeTimezone() {
  const [h] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  return h?.timezone ?? "Europe/Madrid";
}

const allSpots = () =>
  db
    .select({ id: spot.id, name: spot.name, lightLevel: spot.lightLevel, windowDirection: spot.windowDirection })
    .from(spot)
    .orderBy(asc(spot.name));

/** Keeps only suggestions the app can apply: an interval of 1-60 days, or an existing spot (named). */
function usableSuggestion(s: Finding["suggestion"], spots: { id: string; name: string }[]): Suggestion | null {
  if (!s) return null;
  if (s.kind === "water") return Number.isInteger(s.days) && s.days >= 1 && s.days <= 60 ? s : null;
  const target = spots.find((x) => x.id === s.spotId);
  return target ? { kind: "spot", spotId: target.id, spotName: target.name } : null;
}

/** One model call through the budget; null when skipped, refused or unusable. */
async function runCheck(input: CheckInput, deps: CheckDeps): Promise<Finding | null> {
  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : callLive);
  try {
    const raw = await withBudget("health_check", null, MODEL, async () => {
      const out = await call(input);
      return { result: out, usage: out.usage };
    });
    if (raw.refused) return null;
    const parsed = HealthFinding.safeParse(raw.output);
    if (!parsed.success) {
      console.error(`health check: unusable output for ${input.plantName}`);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error(`health check skipped for ${input.plantName}`, error);
    return null;
  }
}

/**
 * Checks one new plant photo against the plant's history. The photo is marked
 * checked first, so a failing check is never retried forever.
 */
export async function checkPhoto(photoId: string, deps: CheckDeps = {}): Promise<"alert" | "healthy" | "skipped"> {
  const [ph] = await db.update(photo).set({ checkedAt: new Date() }).where(eq(photo.id, photoId)).returning();
  if (!ph) return "skipped";
  const [p] = await db.select().from(plant).where(eq(plant.id, ph.plantId));
  const [previous] = await db
    .select({ objectKey: photo.objectKey })
    .from(photo)
    .where(and(eq(photo.plantId, ph.plantId), eq(photo.kind, "plant"), lt(photo.takenAt, ph.takenAt)))
    .orderBy(desc(photo.takenAt))
    .limit(1);
  const spots = await allSpots();
  const finding = await runCheck(
    {
      kind: "photo",
      plantName: p.name,
      context: await plantContext(p.id),
      spots,
      flags: [],
      photoKeys: previous ? [ph.objectKey, previous.objectKey] : [ph.objectKey],
    },
    deps,
  );
  if (!finding) return "skipped";
  if (!finding.problem) return "healthy";
  await createAlert({
    plantId: p.id,
    source: "photo",
    category: finding.category,
    texts: finding.texts,
    suggestion: usableSuggestion(finding.suggestion, spots),
    photoId,
  });
  return "alert";
}

let photoChecksInFlight: Promise<number> | null = null;

/** Checks plant photos not checked yet, oldest first. Overlapping calls share one run. */
export function runPhotoChecks(limit = 5): Promise<number> {
  photoChecksInFlight ??= (async () => {
    const pending = await db
      .select({ id: photo.id })
      .from(photo)
      .where(and(eq(photo.kind, "plant"), isNull(photo.checkedAt)))
      .orderBy(asc(photo.createdAt))
      .limit(limit);
    let checked = 0;
    for (const { id } of pending) {
      await checkPhoto(id);
      checked++;
    }
    return checked;
  })().finally(() => {
    photoChecksInFlight = null;
  });
  return photoChecksInFlight;
}

/**
 * Weekly per plant: simple rules flag warning signs in the care history, and
 * only flagged plants are sent to the model. Returns the number of warnings.
 */
export async function runPatternChecks(today: string, deps: CheckDeps = {}): Promise<number> {
  const tz = await homeTimezone();
  const due = await db
    .select()
    .from(plant)
    .where(
      and(
        eq(plant.status, "alive"),
        or(isNull(plant.lastPatternCheckOn), lte(plant.lastPatternCheckOn, addDays(today, -PATTERN_EVERY_DAYS))),
      ),
    );
  const spots = due.length ? await allSpots() : [];
  let created = 0;
  for (const p of due) {
    await db.update(plant).set({ lastPatternCheckOn: today }).where(eq(plant.id, p.id));
    const [completions, tasks] = await Promise.all([
      db
        .select({ at: taskCompletion.completedAt, taskType: taskCompletion.type, outcome: taskCompletion.outcome })
        .from(taskCompletion)
        .where(eq(taskCompletion.plantId, p.id))
        .orderBy(desc(taskCompletion.completedAt))
        .limit(20),
      db
        .select({ type: careTask.type, dueOn: careTask.dueOn, active: careTask.active })
        .from(careTask)
        .where(eq(careTask.plantId, p.id)),
    ]);
    const flags = flagPatterns({
      today,
      completions: completions.map((c) => ({ taskType: c.taskType, outcome: c.outcome, day: todayIn(tz, c.at) })),
      tasks,
      lastMood: p.lastMood as Mood | null,
      lastMoodOn: p.lastMoodAt ? todayIn(tz, p.lastMoodAt) : null,
    });
    if (flags.length === 0) continue;
    const finding = await runCheck(
      { kind: "pattern", plantName: p.name, context: await plantContext(p.id), spots, flags, photoKeys: [] },
      deps,
    );
    if (!finding?.problem) continue;
    const id = await createAlert({
      plantId: p.id,
      source: "pattern",
      category: finding.category,
      texts: finding.texts,
      suggestion: usableSuggestion(finding.suggestion, spots),
    });
    if (id) created++;
  }
  return created;
}
