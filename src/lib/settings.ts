import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/locales";

const PUSH_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function setLocale(userId: string, locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new Error("Invalid locale");
  await db.update(user).set({ locale }).where(eq(user.id, userId));
}

export async function setPushTime(userId: string, time: string): Promise<void> {
  if (!PUSH_TIME.test(time)) throw new Error("Invalid time");
  await db.update(user).set({ pushTime: time }).where(eq(user.id, userId));
}
