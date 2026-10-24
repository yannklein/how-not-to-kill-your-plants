import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, photo, plant } from "@/db/schema";
import { visibleGroupIds, type CareTask, type Plant } from "@/lib/access";
import { signedUrl } from "@/lib/storage";
import { daysBetween } from "@/lib/time";

export type DueGroup = {
  plant: Plant & { coverUrl: string | null };
  tasks: (CareTask & { overdueDays: number })[];
};

/** Signed URLs for the given plants' cover photos, keyed by plant id. */
export async function coverUrls(plants: Pick<Plant, "id" | "coverPhotoId">[]): Promise<Map<string, string>> {
  const photoIds = plants.flatMap((p) => (p.coverPhotoId ? [p.coverPhotoId] : []));
  const out = new Map<string, string>();
  if (photoIds.length === 0) return out;
  const rows = await db
    .select({ id: photo.id, objectKey: photo.objectKey })
    .from(photo)
    .where(inArray(photo.id, photoIds));
  const keyById = new Map(rows.map((r) => [r.id, r.objectKey]));
  await Promise.all(
    plants.map(async (p) => {
      const key = p.coverPhotoId ? keyById.get(p.coverPhotoId) : undefined;
      if (key) out.set(p.id, await signedUrl(key));
    }),
  );
  return out;
}

/**
 * Active tasks due on or before `today` for alive plants in the user's groups,
 * grouped by plant. Groups with the most overdue task come first, then by name.
 */
export async function dueTasksForUser(userId: string, today: string): Promise<DueGroup[]> {
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({ task: careTask, plant })
    .from(careTask)
    .innerJoin(plant, eq(careTask.plantId, plant.id))
    .where(
      and(
        inArray(plant.groupId, groupIds),
        eq(plant.status, "alive"),
        eq(careTask.active, true),
        lte(careTask.dueOn, today),
      ),
    )
    .orderBy(asc(careTask.dueOn));

  const byPlant = new Map<string, DueGroup>();
  for (const { task, plant: pl } of rows) {
    const entry = byPlant.get(pl.id) ?? { plant: { ...pl, coverUrl: null }, tasks: [] };
    entry.tasks.push({ ...task, overdueDays: daysBetween(task.dueOn, today) });
    byPlant.set(pl.id, entry);
  }
  const groups = [...byPlant.values()];
  const urls = await coverUrls(groups.map((g) => g.plant));
  for (const g of groups) g.plant.coverUrl = urls.get(g.plant.id) ?? null;

  const worst = (g: DueGroup) => Math.max(...g.tasks.map((t) => t.overdueDays));
  return groups.sort((a, b) => worst(b) - worst(a) || a.plant.name.localeCompare(b.plant.name));
}

/** Next active tasks of a plant by due date. Callers must have checked access. */
export async function upcomingTasksForPlant(plantId: string, limit = 5): Promise<CareTask[]> {
  return db
    .select()
    .from(careTask)
    .where(and(eq(careTask.plantId, plantId), eq(careTask.active, true)))
    .orderBy(asc(careTask.dueOn), asc(careTask.type))
    .limit(limit);
}
