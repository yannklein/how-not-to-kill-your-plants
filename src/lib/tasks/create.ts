import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { careTask, home, photo, plant, species, type Persona } from "@/db/schema";
import { visibleGroupIds } from "@/lib/access";
import { ensureCareProfile, getOrCreateSpecies } from "@/lib/ai/care-profile";
import { CareProfile } from "@/lib/ai/schemas";
import { initialTasks } from "@/lib/care/schedule";
import { jpegSize } from "@/lib/image/jpeg-size";
import { assertDraftKeys } from "@/lib/photos";
import { getObjectBytes } from "@/lib/storage";
import { FALLBACK_PROFILE } from "@/lib/tasks/complete";
import { todayIn } from "@/lib/time";

/** How long saving waits for a species' care profile before falling back to the water task only. */
export const CARE_PROFILE_WAIT_MS = 3_000;

export type CreatePlantInput = {
  photoKeys: string[];
  scientificName: string;
  commonName: string;
  name: string;
  persona: Persona | null;
  groupId: string;
  spotId: string | null;
  justBought: boolean;
  potSizeCm: number | null;
};

export class CreatePlantInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatePlantInputError";
  }
}

/** Resolves "ready" | "failed", or "timeout" if the profile is still generating. */
async function profileWithin(speciesId: string, ms: number): Promise<"ready" | "failed" | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ensureCareProfile(speciesId),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function createPlantWithTasks(
  userId: string,
  input: CreatePlantInput,
  opts: { profileWaitMs?: number } = {},
): Promise<{ plantId: string }> {
  const name = input.name.trim();
  const scientificName = input.scientificName.trim();
  if (!name) throw new CreatePlantInputError("A plant name is required");
  if (!scientificName) throw new CreatePlantInputError("A species is required");
  const photoKeys = assertDraftKeys(input.photoKeys);

  if (!(await visibleGroupIds(userId)).includes(input.groupId)) notFound();

  const [homeRow] = await db.select().from(home).limit(1);
  if (!homeRow) throw new Error("Home is not configured");
  const today = todayIn(homeRow.timezone);

  const sizes = await Promise.all(
    photoKeys.map(async (key) => {
      const size = jpegSize(await getObjectBytes(key));
      if (!size) throw new CreatePlantInputError("Photo is not a readable JPEG");
      return size;
    }),
  );

  let sp = await getOrCreateSpecies(scientificName, input.commonName.trim() || scientificName);
  if (sp.careProfileStatus !== "ready") {
    // Bounded wait: a slow model must not make the user stare at a spinner.
    await profileWithin(sp.id, opts.profileWaitMs ?? CARE_PROFILE_WAIT_MS);
    [sp] = await db.select().from(species).where(eq(species.id, sp.id));
  }
  const parsed = sp.careProfileStatus === "ready" ? CareProfile.safeParse(sp.careProfile) : null;

  const tasks = initialTasks({
    today,
    acquiredOn: today,
    justBought: input.justBought,
    profile: parsed?.success ? parsed.data : FALLBACK_PROFILE,
    hemisphere: homeRow.hemisphere,
  }).filter((t) => parsed?.success || t.type === "water"); // cron fills the rest once the profile exists

  const plantId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(plant)
      .values({
        groupId: input.groupId,
        spotId: input.spotId,
        speciesId: sp.id,
        name,
        persona: input.persona,
        acquiredOn: today,
        justBought: input.justBought,
        potSizeCm: input.potSizeCm,
      })
      .returning({ id: plant.id });
    const photos = await tx
      .insert(photo)
      .values(
        photoKeys.map((objectKey, i) => ({
          plantId: created.id,
          userId,
          objectKey,
          width: sizes[i].width,
          height: sizes[i].height,
        })),
      )
      .returning({ id: photo.id, objectKey: photo.objectKey });
    const cover = photos.find((p) => p.objectKey === photoKeys[0]) ?? photos[0];
    await tx.update(plant).set({ coverPhotoId: cover.id }).where(eq(plant.id, created.id));
    await tx.insert(careTask).values(
      tasks.map((t) => ({
        plantId: created.id,
        type: t.type,
        dueOn: t.dueOn,
        state: t.state ?? {},
      })),
    );
    return created.id;
  });
  return { plantId };
}
