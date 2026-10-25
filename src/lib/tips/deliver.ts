import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, plant, tip, tipRecipient } from "@/db/schema";
import { visibleGroupIds } from "@/lib/access";
import type { AlertCategory } from "@/lib/gardener/types";
import { warnedAbout, type TipKind } from "./triggers";

const WEEK = 7 * 24 * 3600_000;
const EXPIRES = 14 * 24 * 3600_000;
const PRIORITY: Record<TipKind, number> = { season: 0, repot: 1, species: 2, pattern: 3 };

/**
 * At most one new tip per person per week: the most important queued one that
 * is still fresh (two weeks from its trigger). The rest wait for next week.
 */
export async function deliverTips(now: Date): Promise<number> {
  const rows = await db
    .select({
      tipId: tipRecipient.tipId,
      userId: tipRecipient.userId,
      shownAt: tipRecipient.shownAt,
      kind: tip.kind,
      triggeredAt: tip.triggeredAt,
      plantId: tip.plantId,
      category: tip.category,
      triggerKey: tip.triggerKey,
    })
    .from(tipRecipient)
    .innerJoin(tip, eq(tip.id, tipRecipient.tipId));

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  let shown = 0;
  for (const [userId, mine] of byUser) {
    if (mine.some((r) => r.shownAt && now.getTime() - r.shownAt.getTime() < WEEK)) continue;
    const queued = mine
      .filter((r) => !r.shownAt && now.getTime() - r.triggeredAt.getTime() <= EXPIRES)
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.triggeredAt.getTime() - b.triggeredAt.getTime());
    let next: (typeof queued)[number] | undefined;
    for (const candidate of queued) {
      if (await stillRelevant(candidate, userId)) {
        next = candidate;
        break;
      }
    }
    if (!next) continue;
    const updated = await db
      .update(tipRecipient)
      .set({ shownAt: now })
      .where(and(eq(tipRecipient.tipId, next.tipId), eq(tipRecipient.userId, userId), isNull(tipRecipient.shownAt)))
      .returning({ tipId: tipRecipient.tipId });
    shown += updated.length;
  }
  return shown;
}

/**
 * A queued tip is only worth showing if its plant is still alive and visible
 * to the person, the gardener hasn't warned about the same thing, and (for a
 * repot) that repot is still coming up.
 */
async function stillRelevant(
  t: { plantId: string | null; category: AlertCategory | null; kind: TipKind; triggerKey: string },
  userId: string,
): Promise<boolean> {
  if (!t.plantId) return true;
  const [p] = await db.select({ status: plant.status, groupId: plant.groupId }).from(plant).where(eq(plant.id, t.plantId));
  if (!p || p.status !== "alive" || !(await visibleGroupIds(userId)).includes(p.groupId)) return false;
  if (t.category && (await warnedAbout(t.plantId, t.category))) return false;
  if (t.kind === "repot") {
    const [, taskId, dueOn] = t.triggerKey.split(":");
    const [task] = await db
      .select({ id: careTask.id })
      .from(careTask)
      .where(and(eq(careTask.id, taskId), eq(careTask.dueOn, dueOn), eq(careTask.active, true)));
    if (!task) return false;
  }
  return true;
}
