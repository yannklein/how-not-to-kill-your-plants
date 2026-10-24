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

/** A model-proposed change the app can apply: 1-60 watering days, or an existing spot (named). */
export function usableSuggestion(
  s: { kind: "water"; days: number } | { kind: "spot"; spotId: string } | null,
  spots: { id: string; name: string }[],
): Suggestion | null {
  if (!s) return null;
  if (s.kind === "water") return Number.isInteger(s.days) && s.days >= 1 && s.days <= 60 ? s : null;
  const target = spots.find((x) => x.id === s.spotId);
  return target ? { kind: "spot", spotId: target.id, spotName: target.name } : null;
}
