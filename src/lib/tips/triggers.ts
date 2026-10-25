import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, gardenerAlert, groupMember, home, plant, species, taskCompletion } from "@/db/schema";
import { CareProfile } from "@/lib/ai/schemas";
import type { AlertCategory } from "@/lib/gardener/types";
import { addDays, todayIn } from "@/lib/time";

export type TipKind = "season" | "repot" | "species" | "pattern";
export type TipCandidate = {
  kind: TipKind;
  plantId: string | null;
  category: AlertCategory | null;
  triggerKey: string;
  params: Record<string, string | number>;
  recipients: string[];
};

const NEW_SPECIES_DAYS = 7;
const REPOT_AHEAD_DAYS = 7;
const WARNING_BLOCK_DAYS = 7;
const RECENT_DAYS = 7;

/** Species name and care basics, so the gardener's tip can be specific to the plant. */
async function aboutPlant(p: { speciesId: string | null }) {
  if (!p.speciesId) return { species: "unknown species", soil: null as string | null, light: null as string | null };
  const [sp] = await db.select().from(species).where(eq(species.id, p.speciesId));
  const profile = sp?.careProfile ? CareProfile.safeParse(sp.careProfile) : null;
  return {
    species: sp?.scientificName ?? "unknown species",
    soil: profile?.success ? profile.data.text.en.soilMix : null,
    light: profile?.success ? profile.data.light : null,
  };
}

async function membersOf(groupId: string): Promise<string[]> {
  const rows = await db.select({ userId: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, groupId));
  return rows.map((r) => r.userId);
}

/** True when the gardener already warned about this plant and category (open, or in the last week). */
export async function warnedAbout(plantId: string, category: AlertCategory): Promise<boolean> {
  const since = new Date(Date.now() - WARNING_BLOCK_DAYS * 24 * 3600_000);
  const [row] = await db
    .select({ id: gardenerAlert.id })
    .from(gardenerAlert)
    .where(
      and(
        eq(gardenerAlert.plantId, plantId),
        eq(gardenerAlert.category, category),
        or(eq(gardenerAlert.status, "open"), gte(gardenerAlert.createdAt, since)),
      ),
    )
    .limit(1);
  return !!row;
}

/** Plant-level tips worth sending today (season tips come from the season-change step). */
export async function findTipCandidates(today: string): Promise<TipCandidate[]> {
  const [h] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  const tz = h?.timezone ?? "Europe/Madrid";
  const out: TipCandidate[] = [];

  // A repot coming up within a week.
  const repots = await db
    .select({ task: careTask, plant })
    .from(careTask)
    .innerJoin(plant, eq(plant.id, careTask.plantId))
    .where(
      and(
        eq(careTask.type, "repot"),
        eq(careTask.active, true),
        eq(plant.status, "alive"),
        gte(careTask.dueOn, today),
        lte(careTask.dueOn, addDays(today, REPOT_AHEAD_DAYS)),
      ),
    );
  for (const { task, plant: p } of repots) {
    const about = await aboutPlant(p);
    out.push({
      kind: "repot",
      plantId: p.id,
      category: "repot",
      triggerKey: `repot:${task.id}:${task.dueOn}`,
      params: {
        plant: p.name,
        dueOn: task.dueOn,
        situation:
          `${p.name} (${about.species}) is due for a repot on ${task.dueOn}, within a week.` +
          (about.soil ? ` Suggested soil: ${about.soil}.` : "") +
          " Give one practical repot tip for this species: organic mix, pot one size up.",
      },
      recipients: await membersOf(p.groupId),
    });
  }

  // A species new to the household: its earliest plant (alive or not) joined in the last week.
  const plants = await db
    .select({ plant, speciesName: species.scientificName })
    .from(plant)
    .innerJoin(species, eq(species.id, plant.speciesId))
    .orderBy(plant.createdAt);
  const firstBySpecies = new Map<string, (typeof plants)[number]>();
  for (const row of plants) if (!firstBySpecies.has(row.plant.speciesId!)) firstBySpecies.set(row.plant.speciesId!, row);
  for (const [speciesId, { plant: p, speciesName }] of firstBySpecies) {
    if (p.status !== "alive" || todayIn(tz, p.createdAt) < addDays(today, -NEW_SPECIES_DAYS)) continue;
    out.push({
      kind: "species",
      plantId: p.id,
      category: null,
      triggerKey: `species:${speciesId}`,
      params: {
        plant: p.name,
        species: speciesName,
        situation:
          `A ${speciesName} called ${p.name} just joined the household (their first one).` +
          " Give the single most useful basics tip for this species indoors (light and watering).",
      },
      recipients: await membersOf(p.groupId),
    });
  }

  // "Still moist" twice in a row on the water task: a gentle drainage hint.
  const alive = await db.select().from(plant).where(eq(plant.status, "alive"));
  if (alive.length) {
    const answers = await db
      .select({ id: taskCompletion.id, plantId: taskCompletion.plantId, outcome: taskCompletion.outcome, at: taskCompletion.completedAt })
      .from(taskCompletion)
      .where(and(eq(taskCompletion.type, "water"), inArray(taskCompletion.plantId, alive.map((p) => p.id))))
      .orderBy(desc(taskCompletion.completedAt));
    for (const p of alive) {
      const lastTwo = answers.filter((a) => a.plantId === p.id).slice(0, 2);
      if (lastTwo.length < 2 || lastTwo.some((a) => a.outcome !== "still_moist")) continue;
      // Only fresh evidence: the latest answer within the last week.
      if (todayIn(tz, lastTwo[0].at) < addDays(today, -RECENT_DAYS)) continue;
      out.push({
        kind: "pattern",
        plantId: p.id,
        category: "overwatering",
        triggerKey: `moist:${p.id}:${lastTwo[0].id}`, // one hint per pair of answers, never weekly repeats
        params: {
          plant: p.name,
          situation:
            `The soil of ${p.name} (${(await aboutPlant(p)).species}) was still moist at the last two watering checks.` +
            " Gently suggest checking that the pot drains well and watering a little less often.",
        },
        recipients: await membersOf(p.groupId),
      });
    }
  }

  // The gardener's warning is the stronger signal: no tip about the same thing.
  const kept: TipCandidate[] = [];
  for (const c of out) if (!(c.plantId && c.category && (await warnedAbout(c.plantId, c.category)))) kept.push(c);
  return kept;
}
