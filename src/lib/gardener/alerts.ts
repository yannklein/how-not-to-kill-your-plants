import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { gardenerAlert, plant } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { getPlantForUser, visibleGroupIds } from "@/lib/access";
import { coverUrls } from "@/lib/tasks/queries";
import { applySuggestion } from "./suggestions";
import type { AlertCategory, Suggestion } from "./types";

export const SUPPRESS_DAYS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a health warning for a plant. Skipped when someone resolved the same
 * plant + category in the last 14 days; otherwise it replaces any open warning.
 */
export async function createAlert(input: {
  plantId: string;
  source: "photo" | "pattern";
  category: AlertCategory;
  texts: Record<Locale, string>;
  suggestion: Suggestion | null;
  photoId?: string | null;
}): Promise<string | null> {
  const since = new Date(Date.now() - SUPPRESS_DAYS * 24 * 3600_000);
  const [recent] = await db
    .select({ id: gardenerAlert.id })
    .from(gardenerAlert)
    .where(
      and(
        eq(gardenerAlert.plantId, input.plantId),
        eq(gardenerAlert.category, input.category),
        inArray(gardenerAlert.status, ["done", "dismissed"]),
        isNotNull(gardenerAlert.resolvedBy), // a person acted on it (not a replacement)
        gte(gardenerAlert.resolvedAt, since),
      ),
    )
    .limit(1);
  if (recent) return null;

  return db.transaction(async (tx) => {
    await tx
      .update(gardenerAlert)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(and(eq(gardenerAlert.plantId, input.plantId), eq(gardenerAlert.status, "open")));
    const [row] = await tx
      .insert(gardenerAlert)
      .values({
        plantId: input.plantId,
        source: input.source,
        category: input.category,
        texts: input.texts,
        suggestion: input.suggestion,
        photoId: input.photoId ?? null,
      })
      .returning({ id: gardenerAlert.id });
    return row.id;
  });
}

/** Done / Not now from anyone in the plant's group clears it for everyone; a second tap is "already". */
export async function resolveAlert(
  userId: string,
  alertId: string,
  status: "done" | "dismissed",
): Promise<"ok" | "already"> {
  if (!UUID.test(alertId)) notFound();
  const [row] = await db.select({ plantId: gardenerAlert.plantId }).from(gardenerAlert).where(eq(gardenerAlert.id, alertId));
  if (!row) notFound();
  await getPlantForUser(userId, row.plantId);
  const updated = await db
    .update(gardenerAlert)
    .set({ status, resolvedBy: userId, resolvedAt: new Date() })
    .where(and(eq(gardenerAlert.id, alertId), eq(gardenerAlert.status, "open")))
    .returning({ id: gardenerAlert.id });
  return updated.length ? "ok" : "already";
}

export type AlertView = {
  id: string;
  plantId: string;
  plantName: string;
  coverUrl: string | null;
  category: AlertCategory;
  text: string;
  suggestion: Suggestion | null;
  createdAt: Date;
};

/** Open warnings on alive plants in the user's groups, newest first. */
export async function openAlertsForUser(userId: string, locale: Locale): Promise<AlertView[]> {
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) return [];
  const rows = await db
    .select({ alert: gardenerAlert, plant })
    .from(gardenerAlert)
    .innerJoin(plant, eq(plant.id, gardenerAlert.plantId))
    .where(and(eq(gardenerAlert.status, "open"), inArray(plant.groupId, groupIds), eq(plant.status, "alive")))
    .orderBy(desc(gardenerAlert.createdAt));
  const covers = await coverUrls(rows.map((r) => r.plant));
  return rows.map(({ alert, plant: p }) => ({
    id: alert.id,
    plantId: p.id,
    plantName: p.name,
    coverUrl: covers.get(p.id) ?? null,
    category: alert.category,
    text: alert.texts[locale] || alert.texts.en,
    suggestion: (alert.suggestion as Suggestion | null) ?? null,
    createdAt: alert.createdAt,
  }));
}

/** The warning's suggested change, applied after a tap by anyone in the plant's group. */
export async function applyAlertSuggestion(userId: string, alertId: string): Promise<"applied" | "gone" | "same"> {
  if (!UUID.test(alertId)) notFound();
  const [row] = await db
    .select({ plantId: gardenerAlert.plantId, suggestion: gardenerAlert.suggestion })
    .from(gardenerAlert)
    .where(eq(gardenerAlert.id, alertId));
  if (!row?.suggestion) notFound();
  const result = await applySuggestion(userId, row.plantId, row.suggestion as Suggestion);
  // Acting on the advice (or finding it already in place) settles the card for everyone.
  if (result !== "gone") await resolveAlert(userId, alertId, "done");
  return result;
}
