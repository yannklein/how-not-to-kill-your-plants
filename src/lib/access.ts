import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { careTask, groupMember, plant } from "@/db/schema";

export type Plant = typeof plant.$inferSelect;
export type CareTask = typeof careTask.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function visibleGroupIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ groupId: groupMember.groupId })
    .from(groupMember)
    .where(eq(groupMember.userId, userId));
  return rows.map((r) => r.groupId);
}

export async function listPlantsForUser(
  userId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<Plant[]> {
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) return [];
  const conditions = [inArray(plant.groupId, groupIds)];
  if (!opts.includeInactive) conditions.push(eq(plant.status, "alive"));
  return db.select().from(plant).where(and(...conditions));
}

export async function getPlantForUser(userId: string, plantId: string): Promise<Plant> {
  if (!UUID_RE.test(plantId)) notFound();
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) notFound();
  const [row] = await db
    .select()
    .from(plant)
    .where(and(eq(plant.id, plantId), inArray(plant.groupId, groupIds)));
  if (!row) notFound();
  return row;
}

export async function getTaskForUser(
  userId: string,
  taskId: string,
): Promise<CareTask & { plant: Plant }> {
  if (!UUID_RE.test(taskId)) notFound();
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) notFound();
  const [row] = await db
    .select({ task: careTask, plant })
    .from(careTask)
    .innerJoin(plant, eq(careTask.plantId, plant.id))
    .where(and(eq(careTask.id, taskId), inArray(plant.groupId, groupIds)));
  if (!row) notFound();
  return { ...row.task, plant: row.plant };
}
