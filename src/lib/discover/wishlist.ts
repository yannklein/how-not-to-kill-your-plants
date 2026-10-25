import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { wishlistItem } from "@/db/schema";
import type { DiscoverCard } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mine = (userId: string, wishId: string) => and(eq(wishlistItem.id, wishId), eq(wishlistItem.userId, userId));

/** Saves a Discover suggestion to the user's own wishlist (once per species). */
export async function saveWish(userId: string, card: DiscoverCard): Promise<string> {
  const [existing] = await db
    .select({ id: wishlistItem.id })
    .from(wishlistItem)
    .where(and(eq(wishlistItem.userId, userId), eq(wishlistItem.scientificName, card.scientificName)))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(wishlistItem)
    .values({
      userId,
      name: card.commonName,
      reason: card.whyItFits,
      scientificName: card.scientificName,
      card: card as unknown as Record<string, unknown>,
    })
    .returning({ id: wishlistItem.id });
  return row.id;
}

export async function listWishes(userId: string): Promise<{ id: string; card: DiscoverCard; createdAt: Date }[]> {
  const rows = await db
    .select()
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId))
    .orderBy(desc(wishlistItem.createdAt));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    card: (r.card as unknown as DiscoverCard | null) ?? {
      scientificName: r.scientificName ?? r.name,
      commonName: r.name,
      whyItFits: r.reason ?? "",
      ease: "",
      goesWith: "",
      benefits: "",
      safety: "",
      harvest: null,
    },
  }));
}

export async function wishForUser(
  userId: string,
  wishId: string,
): Promise<{ id: string; scientificName: string; commonName: string } | null> {
  if (!UUID.test(wishId)) return null;
  const [row] = await db.select().from(wishlistItem).where(mine(userId, wishId));
  return row ? { id: row.id, scientificName: row.scientificName ?? row.name, commonName: row.name } : null;
}

export async function removeWish(userId: string, wishId: string): Promise<void> {
  if (!UUID.test(wishId)) notFound();
  const deleted = await db.delete(wishlistItem).where(mine(userId, wishId)).returning({ id: wishlistItem.id });
  if (deleted.length === 0) notFound();
}

/** After "I bought it" and a successful save: the item leaves its owner's wishlist. Never touches others' items. */
export async function consumeWish(userId: string, wishId: string): Promise<void> {
  if (!UUID.test(wishId)) return;
  await db.delete(wishlistItem).where(mine(userId, wishId));
}
