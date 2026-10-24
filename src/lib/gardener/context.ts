import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, home, moment, plant, species, spot, taskCompletion } from "@/db/schema";
import { listPlantsForUser } from "@/lib/access";
import { CareProfile } from "@/lib/ai/schemas";
import { isGrowing, seasonOf, type Season } from "@/lib/care/season";
import type { TaskOutcome, TaskType } from "@/lib/care/types";
import { currentMoods } from "@/lib/feed/queries";
import type { Mood } from "@/lib/feed/types";
import { todayIn } from "@/lib/time";

export type PlantContext = {
  name: string;
  species: string | null;
  persona: string | null;
  care: { light: string; waterEveryDays: { min: number; max: number }; humidity: string; soil: string } | null;
  waterIntervalOverrideDays: number | null;
  spot: { name: string; lightLevel: string; windowDirection: string } | null;
  mood: Mood;
  completions: { day: string; taskType: TaskType; outcome: TaskOutcome }[];
  moments: { day: string; type: string }[];
  tasks: { type: TaskType; dueOn: string }[];
};

async function homeRow() {
  const [h] = await db.select().from(home).limit(1);
  return { timezone: h?.timezone ?? "Europe/Madrid", hemisphere: h?.hemisphere ?? ("N" as const), city: h?.city ?? "" };
}

/** Everything the gardener should know about one plant. Callers have already checked access. */
export async function plantContext(plantId: string): Promise<PlantContext> {
  const h = await homeRow();
  const today = todayIn(h.timezone);
  const [p] = await db.select().from(plant).where(eq(plant.id, plantId));
  const [[sp], [place], completions, moments, tasks, moods] = await Promise.all([
    p.speciesId ? db.select().from(species).where(eq(species.id, p.speciesId)) : Promise.resolve([]),
    p.spotId ? db.select().from(spot).where(eq(spot.id, p.spotId)) : Promise.resolve([]),
    db
      .select({ at: taskCompletion.completedAt, taskType: taskCompletion.type, outcome: taskCompletion.outcome })
      .from(taskCompletion)
      .where(eq(taskCompletion.plantId, plantId))
      .orderBy(desc(taskCompletion.completedAt))
      .limit(15),
    db
      .select({ at: moment.createdAt, type: moment.type })
      .from(moment)
      .where(eq(moment.plantId, plantId))
      .orderBy(desc(moment.createdAt))
      .limit(5),
    db
      .select({ type: careTask.type, dueOn: careTask.dueOn })
      .from(careTask)
      .where(eq(careTask.plantId, plantId))
      .orderBy(asc(careTask.dueOn)),
    currentMoods([plantId], today),
  ]);
  const profile = sp?.careProfile ? CareProfile.safeParse(sp.careProfile) : null;
  const growing = isGrowing(seasonOf(today, h.hemisphere));
  return {
    name: p.name,
    species: sp?.scientificName ?? null,
    persona: p.persona?.summary ?? null,
    care: profile?.success
      ? {
          light: profile.data.light,
          waterEveryDays: profile.data.waterIntervalDays[growing ? "growing" : "dormant"],
          humidity: profile.data.humidity,
          soil: profile.data.text.en.soilMix,
        }
      : null,
    waterIntervalOverrideDays: p.waterIntervalOverrideDays,
    spot: place ? { name: place.name, lightLevel: place.lightLevel, windowDirection: place.windowDirection } : null,
    mood: moods.get(plantId) ?? "happy",
    completions: completions.map((c) => ({ day: todayIn(h.timezone, c.at), taskType: c.taskType, outcome: c.outcome })),
    moments: moments.map((m) => ({ day: todayIn(h.timezone, m.at), type: m.type })),
    tasks,
  };
}

/** The user's plants (their groups only), every home spot, and the season. */
export async function householdContext(userId: string): Promise<{
  home: { city: string; season: Season };
  spots: { id: string; name: string; lightLevel: string; windowDirection: string }[];
  plants: { id: string; name: string; species: string | null; spot: string | null; mood: Mood }[];
}> {
  const h = await homeRow();
  const today = todayIn(h.timezone);
  const plants = await listPlantsForUser(userId);
  const speciesIds = plants.flatMap((p) => (p.speciesId ? [p.speciesId] : []));
  const [spots, speciesRows, moods] = await Promise.all([
    db
      .select({ id: spot.id, name: spot.name, lightLevel: spot.lightLevel, windowDirection: spot.windowDirection })
      .from(spot)
      .orderBy(asc(spot.name)),
    speciesIds.length
      ? db.select({ id: species.id, name: species.scientificName }).from(species).where(inArray(species.id, speciesIds))
      : Promise.resolve([]),
    currentMoods(plants.map((p) => p.id), today),
  ]);
  const speciesName = new Map(speciesRows.map((s) => [s.id, s.name]));
  const spotName = new Map(spots.map((s) => [s.id, s.name]));
  return {
    home: { city: h.city, season: seasonOf(today, h.hemisphere) },
    spots,
    plants: plants.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.speciesId ? (speciesName.get(p.speciesId) ?? null) : null,
      spot: p.spotId ? (spotName.get(p.spotId) ?? null) : null,
      mood: moods.get(p.id) ?? "happy",
    })),
  };
}
