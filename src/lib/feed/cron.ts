import { and, eq, max, notExists } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, home, photo, plant } from "@/db/schema";
import { addMonths, todayIn } from "@/lib/time";
import { joinedOn } from "./birthdays";

async function homeTimezone(): Promise<string> {
  const [row] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  return row?.timezone ?? "Europe/Madrid";
}

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
