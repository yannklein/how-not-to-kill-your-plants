import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { isLocale } from "@/i18n/locales";
import { assertDraftKeys } from "@/lib/photos";
import { getObjectBytes } from "@/lib/storage";
import { identifyPlant, type IdentifyOutcome } from "./identify";

/** Identify a plant from uploaded draft photos. Bad keys throw; model failures come back as `failure`. */
export async function identifyDraftPhotos(
  userId: string,
  photoKeys: string[],
): Promise<IdentifyOutcome> {
  const keys = assertDraftKeys(photoKeys);
  const [row] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  const images = await Promise.all(
    keys.map(async (key) => ({
      base64: (await getObjectBytes(key)).toString("base64"),
      mediaType: "image/jpeg" as const,
    })),
  );
  return identifyPlant({
    images,
    locale: isLocale(row?.locale) ? row.locale : "en",
    userId,
  });
}
