import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { calendarToken, home, user } from "@/db/schema";
import { buildIcs } from "@/lib/calendar/ics";
import { env } from "@/lib/env";
import { isLocale } from "@/i18n/locales";
import { tasksForUserUntil } from "@/lib/tasks/queries";
import { addDays, todayIn } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const [row] = await db
    .select({ userId: calendarToken.userId, locale: user.locale })
    .from(calendarToken)
    .innerJoin(user, eq(user.id, calendarToken.userId))
    .where(eq(calendarToken.token, token));
  if (!row) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const [homeRow] = await db.select({ timezone: home.timezone }).from(home).limit(1);
  const tz = homeRow?.timezone ?? "Europe/Madrid";
  const today = todayIn(tz);
  const tasks = await tasksForUserUntil(row.userId, addDays(today, 60));
  const body = buildIcs({
    userId: row.userId,
    locale: isLocale(row.locale) ? row.locale : "en",
    today,
    tz,
    appUrl: env.APP_URL,
    tasks,
  });
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
