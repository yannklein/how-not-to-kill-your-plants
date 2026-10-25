import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { plant, tip, tipRecipient } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { visibleGroupIds } from "@/lib/access";
import { renderTipText } from "./create";
import type { TipKind } from "./triggers";

export type TipItem = { id: string; kind: TipKind; plant: { id: string; name: string } | null; text: string; shownAt: Date };

/**
 * Tips shown to the user, newest first. Tips about a plant the user can no
 * longer see (dead, given away, moved out of their groups) drop out.
 */
export async function tipsForUser(
  userId: string,
  locale: Locale,
  opts: { since?: Date; before?: Date; limit?: number } = {},
): Promise<TipItem[]> {
  const groupIds = await visibleGroupIds(userId);
  const plantVisible = groupIds.length
    ? and(eq(plant.status, "alive"), inArray(plant.groupId, groupIds))
    : undefined;
  const rows = await db
    .select({ tip, plantId: plant.id, plantName: plant.name, shownAt: tipRecipient.shownAt })
    .from(tipRecipient)
    .innerJoin(tip, eq(tip.id, tipRecipient.tipId))
    .leftJoin(plant, eq(plant.id, tip.plantId))
    .where(
      and(
        eq(tipRecipient.userId, userId),
        isNotNull(tipRecipient.shownAt),
        plantVisible ? or(isNull(tip.plantId), plantVisible) : isNull(tip.plantId),
        opts.since ? gte(tipRecipient.shownAt, opts.since) : undefined,
        opts.before ? lt(tipRecipient.shownAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(tipRecipient.shownAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({
    id: r.tip.id,
    kind: r.tip.kind,
    plant: r.plantId ? { id: r.plantId, name: r.plantName! } : null,
    text: renderTipText(r.tip, locale),
    shownAt: r.shownAt!,
  }));
}
