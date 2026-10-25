import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tip, tipRecipient } from "@/db/schema";
import type { TipKind } from "./triggers";

const WEEK = 7 * 24 * 3600_000;
const EXPIRES = 14 * 24 * 3600_000;
const PRIORITY: Record<TipKind, number> = { season: 0, repot: 1, species: 2, pattern: 3 };

/**
 * At most one new tip per person per week: the most important queued one that
 * is still fresh (two weeks from its trigger). The rest wait for next week.
 */
export async function deliverTips(now: Date): Promise<number> {
  const rows = await db
    .select({ tipId: tipRecipient.tipId, userId: tipRecipient.userId, shownAt: tipRecipient.shownAt, kind: tip.kind, triggeredAt: tip.triggeredAt })
    .from(tipRecipient)
    .innerJoin(tip, eq(tip.id, tipRecipient.tipId));

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  let shown = 0;
  for (const [userId, mine] of byUser) {
    if (mine.some((r) => r.shownAt && now.getTime() - r.shownAt.getTime() < WEEK)) continue;
    const next = mine
      .filter((r) => !r.shownAt && now.getTime() - r.triggeredAt.getTime() <= EXPIRES)
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.triggeredAt.getTime() - b.triggeredAt.getTime())[0];
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

