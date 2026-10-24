import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { calendarToken } from "@/db/schema";

const newToken = () => randomBytes(32).toString("base64url");

export async function getOrCreateCalendarToken(userId: string): Promise<string> {
  const [row] = await db
    .insert(calendarToken)
    .values({ userId, token: newToken() })
    .onConflictDoNothing({ target: calendarToken.userId })
    .returning({ token: calendarToken.token });
  if (row) return row.token;
  const [existing] = await db
    .select({ token: calendarToken.token })
    .from(calendarToken)
    .where(eq(calendarToken.userId, userId));
  return existing.token;
}

export async function regenerateCalendarToken(userId: string): Promise<string> {
  const token = newToken();
  await db
    .insert(calendarToken)
    .values({ userId, token })
    .onConflictDoUpdate({ target: calendarToken.userId, set: { token, createdAt: new Date() } });
  return token;
}

export function calendarUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/calendar/${token}`;
}

/** webcal:// variant of the feed URL, for the "Add to Apple Calendar" button. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, "webcal://");
}
