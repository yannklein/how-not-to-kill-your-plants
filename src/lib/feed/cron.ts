import { and, asc, eq, gte, lt, max, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, feedEvent, feedText, home, photo, plant } from "@/db/schema";
import { isGrowing, seasonOf, type Season } from "@/lib/care/season";
import { addMonths, todayIn } from "@/lib/time";
import { birthdayKind, joinedOn } from "./birthdays";
import { createEvent } from "./events";
import { currentMoods } from "./queries";
import { generateFeedTexts } from "./text";
import type { Mood } from "./types";

async function homeTimezone(): Promise<string> {
  const [row] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  return row?.timezone ?? "Europe/Madrid";
}

const alivePlants = () => db.select().from(plant).where(eq(plant.status, "alive"));

/**
 * Gives every alive plant without one a monthly portrait task, due a month
 * after its latest plant photo (or after it joined). Covers plants added
 * before Phase 2 and plants whose initial tasks were cut short.
 */
export async function backfillPhotoTasks(): Promise<number> {
  const tz = await homeTimezone();
  const rows = await db
    .select({ id: plant.id, createdAt: plant.createdAt, lastPhotoAt: max(photo.takenAt) })
    .from(plant)
    .leftJoin(photo, and(eq(photo.plantId, plant.id), eq(photo.kind, "plant")))
    .where(
      and(
        eq(plant.status, "alive"),
        notExists(
          db
            .select({ id: careTask.id })
            .from(careTask)
            .where(and(eq(careTask.plantId, plant.id), eq(careTask.type, "photo"))),
        ),
      ),
    )
    .groupBy(plant.id, plant.createdAt);

  let created = 0;
  for (const row of rows) {
    const from = row.lastPhotoAt ? todayIn(tz, row.lastPhotoAt) : joinedOn(row.createdAt, tz);
    const inserted = await db
      .insert(careTask)
      .values({ plantId: row.id, type: "photo", dueOn: addMonths(from, 1) })
      .onConflictDoNothing()
      .returning({ id: careTask.id });
    created += inserted.length;
  }
  return created;
}

/**
 * Mood posts only when a plant starts or stops sulking. A plant seen for the
 * first time (Phase 2 deploy, new plant) just gets its baseline.
 */
export async function runMoodChanges(today: string): Promise<number> {
  const plants = await alivePlants();
  const moods = await currentMoods(
    plants.map((p) => p.id),
    today,
  );
  let posted = 0;
  for (const p of plants) {
    const to = moods.get(p.id)!;
    const from = p.lastMood as Mood | null;
    if (from === to) continue;
    if (from && (from === "sulking" || to === "sulking")) {
      await createEvent(p.id, "mood", { from, to });
      posted++;
    }
    await db.update(plant).set({ lastMood: to }).where(eq(plant.id, p.id));
  }
  return posted;
}

/** Season posts only when the growing season starts or ends; the first run just records the season. */
export async function runSeasonChanges(today: string): Promise<number> {
  const [h] = await db.select().from(home).limit(1);
  if (!h) return 0;
  const season = seasonOf(today, h.hemisphere);
  const previous = h.lastSeason as Season | null;
  if (previous === season) return 0;
  await db.update(home).set({ lastSeason: season }).where(eq(home.id, h.id));
  if (!previous || isGrowing(previous) === isGrowing(season)) return 0;

  const plants = await alivePlants();
  for (const p of plants) await createEvent(p.id, "season", { season, growing: isGrowing(season) });
  return plants.length;
}

/** One birthday post per plant per occasion: one month after joining, then yearly. */
export async function runBirthdays(today: string): Promise<number> {
  const tz = await homeTimezone();
  let posted = 0;
  for (const p of await alivePlants()) {
    const occasion = birthdayKind(joinedOn(p.createdAt, tz), today);
    if (!occasion) continue;
    const [already] = await db
      .select({ id: feedEvent.id })
      .from(feedEvent)
      .where(
        and(
          eq(feedEvent.plantId, p.id),
          eq(feedEvent.type, "birthday"),
          sql`${feedEvent.payload}->>'kind' = ${occasion.kind}`,
          sql`(${feedEvent.payload}->>'years')::int = ${occasion.years}`,
        ),
      )
      .limit(1);
    if (already) continue;
    await createEvent(p.id, "birthday", occasion);
    posted++;
  }
  return posted;
}

const TEXT_FILL_DAYS = 2;

let fillInFlight: Promise<number> | null = null;

/**
 * Writes texts for recent posts that have none yet (oldest first). Returns how
 * many got stored. Overlapping calls (several actions in a row, a cron tick)
 * share one run, so no event is sent to the model twice. Single app process.
 */
export function runFeedTextFill(limit = 10): Promise<number> {
  fillInFlight ??= fillTexts(limit).finally(() => {
    fillInFlight = null;
  });
  return fillInFlight;
}

async function fillTexts(limit: number): Promise<number> {
  const pending = await db
    .select({ id: feedEvent.id })
    .from(feedEvent)
    .where(
      and(
        gte(feedEvent.createdAt, new Date(Date.now() - TEXT_FILL_DAYS * 24 * 3600_000)),
        lt(feedEvent.textAttempts, 2),
        notExists(db.select({ e: feedText.eventId }).from(feedText).where(eq(feedText.eventId, feedEvent.id))),
      ),
    )
    .orderBy(asc(feedEvent.createdAt))
    .limit(limit);
  let stored = 0;
  for (const { id } of pending) if ((await generateFeedTexts(id)) === "stored") stored++;
  return stored;
}
