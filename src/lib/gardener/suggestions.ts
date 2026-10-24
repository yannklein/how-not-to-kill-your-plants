import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plant, spot } from "@/db/schema";
import { getPlantForUser } from "@/lib/access";
import type { Suggestion } from "./types";

export class SuggestionError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies a gardener suggestion after the user tapped it. A spot that no
 * longer exists is "gone"; a value already in place is "same".
 */
export async function applySuggestion(
  userId: string,
  plantId: string,
  s: Suggestion,
): Promise<"applied" | "gone" | "same"> {
  const current = await getPlantForUser(userId, plantId);
  if (s.kind === "water") {
    if (!Number.isInteger(s.days) || s.days < 1 || s.days > 60) throw new SuggestionError("Invalid watering interval");
    if (current.waterIntervalOverrideDays === s.days) return "same";
    await db.update(plant).set({ waterIntervalOverrideDays: s.days }).where(eq(plant.id, plantId));
    return "applied";
  }
  if (!UUID.test(s.spotId)) return "gone";
  const [target] = await db.select({ id: spot.id }).from(spot).where(eq(spot.id, s.spotId));
  if (!target) return "gone";
  if (current.spotId === s.spotId) return "same";
  await db.update(plant).set({ spotId: s.spotId }).where(eq(plant.id, plantId));
  return "applied";
}
