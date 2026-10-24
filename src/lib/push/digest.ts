import { and, eq, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { db } from "@/db/client";
import { careTask, home, plant, pushSubscription, species, user } from "@/db/schema";
import { isLocale } from "@/i18n/locales";
import { ensureCareProfile } from "@/lib/ai/care-profile";
import type { CareProfile } from "@/lib/ai/schemas";
import { initialTasks } from "@/lib/care/schedule";
import { dueTasksForUser, type DueGroup } from "@/lib/tasks/queries";
import { localTimeIn, todayIn } from "@/lib/time";
import { sendPush, type SendPush } from "./send";

const MAX_NAMES = 4;

async function homeSettings() {
  const [row] = await db.select().from(home).limit(1);
  return {
    timezone: row?.timezone ?? "Europe/Madrid",
    hemisphere: row?.hemisphere ?? ("N" as const),
  };
}

async function digestMessage(locale: string, groups: DueGroup[]) {
  const l = isLocale(locale) ? locale : "en";
  const messages = (await import(`../../../messages/${l}.json`)).default;
  const t = createTranslator({ locale: l, messages, namespace: "push" });
  const names = groups.map((g) => g.plant.name);
  const shown = names.slice(0, MAX_NAMES).join(", ");
  const more = names.length > MAX_NAMES ? ` +${names.length - MAX_NAMES}` : "";
  const overdue = groups.reduce((n, g) => n + g.tasks.filter((x) => x.overdueDays > 0).length, 0);
  const body = [t("digestBody", { names: shown + more }), overdue > 0 ? t("digestOverdue", { count: overdue }) : null]
    .filter(Boolean)
    .join(" · ");
  return { title: t("digestTitle", { count: groups.length }), body };
}

/**
 * Morning digest: one push per subscription for each user whose local time has
 * reached their push time, who has due tasks, and who has not had one today.
 * Idempotent per day. One user's failure never stops the others.
 */
export async function runDigests(
  now: Date,
  deps: { send?: SendPush } = {},
): Promise<{ sent: number }> {
  const send = deps.send ?? sendPush;
  const { timezone } = await homeSettings();
  const today = todayIn(timezone, now);
  const localTime = localTimeIn(timezone, now);

  const candidates = await db
    .select({ id: user.id, locale: user.locale, pushTime: user.pushTime, lastDigestOn: user.lastDigestOn })
    .from(user)
    .where(sql`exists (select 1 from ${pushSubscription} where ${pushSubscription.userId} = ${user.id})`);

  let sent = 0;
  for (const u of candidates) {
    if (u.lastDigestOn === today || localTime < u.pushTime) continue;
    try {
      const groups = await dueTasksForUser(u.id, today);
      if (groups.length === 0) continue;
      const { title, body } = await digestMessage(u.locale, groups);
      const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, u.id));
      let attempted = 0;
      for (const sub of subs) {
        try {
          const result = await send(sub, { title, body, url: "/" });
          attempted++;
          if (result === "gone") {
            await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
          } else {
            sent++;
          }
        } catch (error) {
          console.error(`push send failed for user ${u.id}`, error);
        }
      }
      // Only mark the day done once a push was attempted (a "gone" attempt has nothing to retry).
      if (attempted > 0) {
        await db.update(user).set({ lastDigestOn: today }).where(eq(user.id, u.id));
      }
    } catch (error) {
      console.error(`digest failed for user ${u.id}`, error);
    }
  }
  return { sent };
}

/** Creates the initial tasks a plant is missing; existing tasks (and their history) are untouched. */
async function backfillTasks(speciesId: string, profile: CareProfile, today: string, hemisphere: "N" | "S") {
  const plants = await db
    .select()
    .from(plant)
    .where(and(eq(plant.speciesId, speciesId), eq(plant.status, "alive")));
  for (const p of plants) {
    const tasks = initialTasks({
      today,
      acquiredOn: p.acquiredOn,
      justBought: p.justBought,
      profile,
      hemisphere,
    });
    await db
      .insert(careTask)
      .values(tasks.map((t) => ({ plantId: p.id, type: t.type, dueOn: t.dueOn, state: t.state ?? {} })))
      .onConflictDoNothing({ target: [careTask.plantId, careTask.type] });
  }
}

/**
 * One care-profile attempt per pending species per tick. When a profile becomes
 * ready, its alive plants get any missing initial tasks. Returns the number of
 * profiles that became ready.
 */
export async function runCareProfileRetries(now: Date = new Date()): Promise<number> {
  const pending = await db
    .select({ id: species.id })
    .from(species)
    .where(eq(species.careProfileStatus, "pending"));
  const { timezone, hemisphere } = await homeSettings();
  const today = todayIn(timezone, now);

  let ready = 0;
  for (const { id } of pending) {
    try {
      if ((await ensureCareProfile(id)) !== "ready") continue;
      const [sp] = await db.select().from(species).where(eq(species.id, id));
      if (!sp?.careProfile) continue;
      await backfillTasks(id, sp.careProfile as unknown as CareProfile, today, hemisphere);
      ready++;
    } catch (error) {
      console.error(`care profile retry failed for species ${id}`, error);
    }
  }
  return ready;
}
