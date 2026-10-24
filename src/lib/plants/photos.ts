import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, home, photo, plant } from "@/db/schema";
import { getPlantForUser } from "@/lib/access";
import { createEvent, logMoment, userName } from "@/lib/feed/events";
import type { MomentType } from "@/lib/feed/types";
import { jpegSize } from "@/lib/image/jpeg-size";
import { assertDraftKeys } from "@/lib/photos";
import { getObjectBytes, signedUrl } from "@/lib/storage";
import { addMonths, todayIn } from "@/lib/time";

export class PlantPhotoError extends Error {}

/**
 * Adds a new portrait to a plant: it becomes the cover, pushes the monthly
 * portrait reminder out by a month, and makes exactly one post — the moment
 * (with the photo attached) when one is picked, otherwise a photo post.
 */
export async function addPlantPhoto(
  userId: string,
  plantId: string,
  draftKey: string,
  momentType: MomentType | null,
): Promise<{ photoId: string; eventId: string }> {
  await getPlantForUser(userId, plantId);
  const [key] = assertDraftKeys([draftKey]);
  const size = jpegSize(await getObjectBytes(key));
  if (!size) throw new PlantPhotoError("Photo is not a readable JPEG");

  const [homeRow] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  const today = todayIn(homeRow?.timezone ?? "Europe/Madrid");

  const [previous] = await db
    .select({ takenAt: photo.takenAt })
    .from(photo)
    .where(and(eq(photo.plantId, plantId), eq(photo.kind, "plant")))
    .orderBy(desc(photo.takenAt))
    .limit(1);

  const photoId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(photo)
      .values({ plantId, userId, objectKey: key, kind: "plant", ...size, takenAt: new Date() })
      .returning({ id: photo.id });
    await tx.update(plant).set({ coverPhotoId: created.id }).where(eq(plant.id, plantId));
    const dueOn = addMonths(today, 1);
    await tx
      .insert(careTask)
      .values({ plantId, type: "photo", dueOn })
      .onConflictDoUpdate({
        target: [careTask.plantId, careTask.type],
        set: { dueOn, active: true, version: sql`${careTask.version} + 1` },
      });
    return created.id;
  });

  if (momentType) {
    const { eventId } = await logMoment(userId, plantId, momentType, photoId);
    return { photoId, eventId };
  }
  const eventId = await createEvent(plantId, "photo", {
    photoId,
    userName: await userName(userId),
    previousPhotoAt: previous ? previous.takenAt.toISOString() : null,
  });
  return { photoId, eventId };
}

/** The plant's portraits, newest first. Label photos are for identification only. */
export async function plantTimeline(plantId: string): Promise<{ id: string; url: string; takenAt: Date }[]> {
  const rows = await db
    .select({ id: photo.id, objectKey: photo.objectKey, takenAt: photo.takenAt })
    .from(photo)
    .where(and(eq(photo.plantId, plantId), eq(photo.kind, "plant")))
    .orderBy(desc(photo.takenAt));
  return Promise.all(rows.map(async (r) => ({ id: r.id, url: await signedUrl(r.objectKey), takenAt: r.takenAt })));
}
