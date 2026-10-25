"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ensureCareProfile, getOrCreateSpecies } from "@/lib/ai/care-profile";
import { identifyDraftPhotos } from "@/lib/ai/identify-drafts";
import type { IdentifyOutcome } from "@/lib/ai/identify";
import { consumeWish } from "@/lib/discover/wishlist";
import { runFeedTextFill } from "@/lib/feed/cron";
import { requireUser } from "@/lib/session";
import { createPlantWithTasks, type CreatePlantInput } from "@/lib/tasks/create";

export async function identifyAction(photoKeys: string[]): Promise<IdentifyOutcome> {
  const user = await requireUser();
  const result = await identifyDraftPhotos(user.id, photoKeys);
  const top = result.isPlant ? result.candidates[0] : undefined;
  if (top) {
    // Pre-warm the care profile so Save rarely has to wait for it.
    after(async () => {
      try {
        const sp = await getOrCreateSpecies(top.scientificName, top.commonName);
        await ensureCareProfile(sp.id);
      } catch (error) {
        console.error("care profile pre-warm failed", error);
      }
    });
  }
  return result;
}

export async function createPlantAction(input: CreatePlantInput, wishId?: string): Promise<{ plantId: string }> {
  const user = await requireUser();
  const created = await createPlantWithTasks(user.id, input);
  if (wishId) await consumeWish(user.id, wishId); // bought from the wishlist: only now that the plant exists
  after(() => runFeedTextFill().catch((err) => console.error("feed text fill failed", err)));
  revalidatePath("/");
  revalidatePath("/plants");
  return created;
}
