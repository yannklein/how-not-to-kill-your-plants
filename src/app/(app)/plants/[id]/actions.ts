"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runFeedTextFill } from "@/lib/feed/cron";
import { deleteMoment, logMoment } from "@/lib/feed/events";
import type { MomentType } from "@/lib/feed/types";
import { addPlantPhoto } from "@/lib/plants/photos";
import { requireUser } from "@/lib/session";

/** Write the new post's text right away instead of waiting for the next cron tick. */
function fillTextsSoon() {
  after(() => runFeedTextFill().catch((err) => console.error("feed text fill failed", err)));
}

export async function addPlantPhotoAction(plantId: string, draftKey: string, momentType: MomentType | null) {
  const user = await requireUser();
  await addPlantPhoto(user.id, plantId, draftKey, momentType);
  fillTextsSoon();
  revalidatePath(`/plants/${plantId}`);
  revalidatePath("/");
}

export async function logMomentAction(plantId: string, momentType: MomentType) {
  const user = await requireUser();
  await logMoment(user.id, plantId, momentType, null);
  fillTextsSoon();
  revalidatePath(`/plants/${plantId}`);
  revalidatePath("/");
}

export async function deleteMomentAction(plantId: string, momentId: string) {
  const user = await requireUser();
  await deleteMoment(user.id, momentId);
  revalidatePath(`/plants/${plantId}`);
  revalidatePath("/");
}
