import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, gardenerAlert, groupMember, home, plant, species, taskCompletion } from "@/db/schema";
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

/** "2026-W47": the ISO week of a day, so a pattern hint fires at most once a week. */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - weekday + 3); // Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function membersOf(groupId: string): Promise<string[]> {
  const rows = await db.select({ userId: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, groupId));
  return rows.map((r) => r.userId);
}

/** True when the gardener already warned about this plant and category (open, or in the last week). */
async function warnedAbout(plantId: string, category: AlertCategory): Promise<boolean> {
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
    out.push({
      kind: "repot",
      plantId: p.id,
      category: "repot",
      triggerKey: `repot:${task.id}:${task.dueOn}`,
      params: { plant: p.name, dueOn: task.dueOn },
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
      params: { plant: p.name, species: speciesName },
      recipients: await membersOf(p.groupId),
    });
  }

  // "Still moist" twice in a row on the water task: a gentle drainage hint.
  const alive = await db.select().from(plant).where(eq(plant.status, "alive"));
  if (alive.length) {
    const answers = await db
      .select({ plantId: taskCompletion.plantId, outcome: taskCompletion.outcome, at: taskCompletion.completedAt })
      .from(taskCompletion)
      .where(and(eq(taskCompletion.type, "water"), inArray(taskCompletion.plantId, alive.map((p) => p.id))))
      .orderBy(desc(taskCompletion.completedAt));
    for (const p of alive) {
      const lastTwo = answers.filter((a) => a.plantId === p.id).slice(0, 2);
      if (lastTwo.length < 2 || lastTwo.some((a) => a.outcome !== "still_moist")) continue;
      out.push({
        kind: "pattern",
        plantId: p.id,
        category: "overwatering",
        triggerKey: `moist:${p.id}:${isoWeek(today)}`,
        params: { plant: p.name },
        recipients: await membersOf(p.groupId),
      });
    }
  }

  // The gardener's warning is the stronger signal: no tip about the same thing.
  const kept: TipCandidate[] = [];
  for (const c of out) if (!(c.plantId && c.category && (await warnedAbout(c.plantId, c.category)))) kept.push(c);
  return kept;
}
