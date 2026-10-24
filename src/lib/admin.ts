import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { group, groupMember, home, lightLevel, plant, spot } from "@/db/schema";

export const WINDOW_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "none"] as const;
export const LIGHT_LEVELS = lightLevel.enumValues;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const homeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  hemisphere: z.enum(["N", "S"]),
  timezone: z.string().refine(isValidTimeZone, "Invalid IANA timezone"),
});
export type HomeInput = z.input<typeof homeSchema>;

const groupSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().min(1)),
});

const spotSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  lightLevel: z.enum(LIGHT_LEVELS),
  windowDirection: z.enum(WINDOW_DIRECTIONS),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null),
});
export type SpotInput = z.input<typeof spotSchema>;

const capSchema = z.number().finite().min(0).max(100000);

async function homeId(): Promise<string | null> {
  const [row] = await db.select({ id: home.id }).from(home).limit(1);
  return row?.id ?? null;
}

export async function saveHome(input: HomeInput): Promise<void> {
  const values = homeSchema.parse(input);
  const id = await homeId();
  if (id) await db.update(home).set(values).where(eq(home.id, id));
  else await db.insert(home).values(values);
}

export async function setAiCap(capUsd: number): Promise<void> {
  const cap = capSchema.parse(capUsd);
  const id = await homeId();
  if (id) await db.update(home).set({ aiMonthlyCapUsd: cap.toFixed(2) }).where(eq(home.id, id));
  else await db.insert(home).values({ aiMonthlyCapUsd: cap.toFixed(2) });
}

/** Creates (no id) or renames (id) a group and replaces its member set. */
export async function upsertGroup(
  name: string,
  memberIds: string[],
  id?: string,
): Promise<string> {
  const input = groupSchema.parse({ id, name, memberIds });
  const members = [...new Set(input.memberIds)];
  return db.transaction(async (tx) => {
    let groupId = input.id;
    if (groupId) {
      const updated = await tx
        .update(group)
        .set({ name: input.name })
        .where(eq(group.id, groupId))
        .returning({ id: group.id });
      if (updated.length === 0) throw new Error("Group not found");
    } else {
      const [created] = await tx
        .insert(group)
        .values({ name: input.name })
        .returning({ id: group.id });
      groupId = created.id;
    }
    await tx.delete(groupMember).where(eq(groupMember.groupId, groupId));
    if (members.length > 0) {
      await tx.insert(groupMember).values(members.map((userId) => ({ groupId, userId })));
    }
    return groupId;
  });
}

export async function upsertSpot(input: SpotInput): Promise<string> {
  const { id, ...values } = spotSchema.parse(input);
  if (id) {
    const updated = await db.update(spot).set(values).where(eq(spot.id, id)).returning({ id: spot.id });
    if (updated.length === 0) throw new Error("Spot not found");
    return id;
  }
  const [created] = await db.insert(spot).values(values).returning({ id: spot.id });
  return created.id;
}

export async function deleteSpot(id: string): Promise<void> {
  z.uuid().parse(id);
  await db.transaction(async (tx) => {
    await tx.update(plant).set({ spotId: null }).where(eq(plant.spotId, id));
    await tx.delete(spot).where(eq(spot.id, id));
  });
}
