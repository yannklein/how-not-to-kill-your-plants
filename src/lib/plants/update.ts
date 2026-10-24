import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { plant, spot } from "@/db/schema";
import { getPlantForUser, visibleGroupIds, type Plant } from "@/lib/access";

export class PlantInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlantInputError";
  }
}

const optionalPositiveInt = z.number().int().positive().max(1000).nullable();

export const UpdatePlantInput = z.object({
  name: z.string().trim().min(1).max(100),
  groupId: z.uuid(),
  spotId: z.uuid().nullable(),
  status: z.enum(["alive", "dead", "given_away"]),
  waterIntervalOverrideDays: optionalPositiveInt,
  potSizeCm: optionalPositiveInt,
  /** Omitted = unchanged. */
  persona: z
    .object({
      summary: z.string().trim().min(1).max(300),
      traits: z.array(z.string().trim().min(1).max(40)).max(5),
    })
    .nullable()
    .optional(),
});
export type UpdatePlantInput = z.infer<typeof UpdatePlantInput>;

/** Validates and applies an edit. The plant and the target group must both be visible to the user. */
export async function updatePlant(userId: string, plantId: string, raw: unknown): Promise<Plant> {
  const current = await getPlantForUser(userId, plantId);
  const parsed = UpdatePlantInput.safeParse(raw);
  if (!parsed.success) throw new PlantInputError("Invalid plant details");
  const input = parsed.data;

  if (input.groupId !== current.groupId) {
    const groupIds = await visibleGroupIds(userId);
    if (!groupIds.includes(input.groupId)) throw new PlantInputError("Unknown group");
  }
  if (input.spotId && input.spotId !== current.spotId) {
    const found = await db.select({ id: spot.id }).from(spot).where(inArray(spot.id, [input.spotId]));
    if (found.length === 0) throw new PlantInputError("Unknown spot");
  }

  const [updated] = await db.update(plant).set(input).where(eq(plant.id, current.id)).returning();
  return updated;
}
