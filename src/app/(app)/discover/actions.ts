"use server";

import { revalidatePath } from "next/cache";
import { runDiscover } from "@/lib/discover/search";
import type { DiscoverCard, DiscoverInput } from "@/lib/discover/types";
import { removeWish, saveWish } from "@/lib/discover/wishlist";
import { requireUser } from "@/lib/session";

export async function runDiscoverAction(input: DiscoverInput): Promise<"ok" | "paused" | "error"> {
  const user = await requireUser();
  const result = await runDiscover(user.id, input);
  revalidatePath("/discover");
  return result.status;
}

export async function saveWishAction(card: DiscoverCard): Promise<void> {
  const user = await requireUser();
  await saveWish(user.id, card);
  revalidatePath("/wishlist");
}

export async function removeWishAction(wishId: string): Promise<void> {
  const user = await requireUser();
  await removeWish(user.id, wishId);
  revalidatePath("/wishlist");
}
