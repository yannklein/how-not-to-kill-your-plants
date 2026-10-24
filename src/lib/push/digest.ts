import { and, eq, gte, or, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { db } from "@/db/client";
import { careTask, feedEvent, groupMember, home, plant, pushSubscription, species, user } from "@/db/schema";
import { isLocale } from "@/i18n/locales";
import { ensureCareProfile } from "@/lib/ai/care-profile";
import { CareProfile } from "@/lib/ai/schemas";
import { initialTasks } from "@/lib/care/schedule";
import { dueTasksForUser, type DueGroup } from "@/lib/tasks/queries";
import { localTimeIn, todayIn } from "@/lib/time";
import { sendPush, type SendPush } from "./send";

const MAX_NAMES = 4;
const LATE_WINDOW_MINUTES = 3 * 60;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function homeSettings() {
  const [row] = await db.select().from(home).limit(1);
  return {
    timezone: row?.timezone ?? "Europe/Madrid",
    hemisphere: row?.hemisphere ?? ("N" as const),
  };
}

/** "A, B, C, D +2" */
const shortList = (names: string[]) =>
  names.slice(0, MAX_NAMES).join(", ") + (names.length > MAX_NAMES ? ` +${names.length - MAX_NAMES}` : "");

type Celebration = { name: string; kind: "birthday" | "firstFlower" };

async function digestMessage(locale: string, groups: DueGroup[], celebrations: Celebration[]) {
  const l = isLocale(locale) ? locale : "en";
  const messages = (await import(`../../../messages/${l}.json`)).default;
  const t = createTranslator({ locale: l, messages, namespace: "push" });
  const birthdays = celebrations.filter((c) => c.kind === "birthday").map((c) => c.name);
  const lines = [
    birthdays.length === 1 ? t("birthdayLine", { name: birthdays[0] }) : null,
    birthdays.length > 1 ? t("birthdaysLine", { names: shortList(birthdays) }) : null,
    ...celebrations.filter((c) => c.kind === "firstFlower").map((c) => t("firstFlowerLine", { name: c.name })),
  ].filter((x): x is string => x !== null);
  if (groups.length === 0) return { title: t("celebrationTitle"), body: lines.join(" · ") };

  const overdue = groups.reduce((n, g) => n + g.tasks.filter((x) => x.overdueDays > 0).length, 0);
  const body = [t("digestBody", { names: shortList(groups.map((g) => g.plant.name)) }), overdue > 0 ? t("digestOverdue", { count: overdue }) : null, ...lines]
    .filter(Boolean)
    .join(" · ");
  return { title: t("digestTitle", { count: groups.length }), body };
}

/** Today's birthdays and first flowers among the user's plants: the only non-care lines a push carries. */
async function celebrationsFor(userId: string, today: string, timezone: string, now: Date): Promise<Celebration[]> {
  const rows = await db
    .select({ name: plant.name, type: feedEvent.type, createdAt: feedEvent.createdAt })
    .from(feedEvent)
    .innerJoin(plant, eq(plant.id, feedEvent.plantId))
    .innerJoin(groupMember, and(eq(groupMember.groupId, plant.groupId), eq(groupMember.userId, userId)))
    .where(
      and(
        eq(plant.status, "alive"),
        gte(feedEvent.createdAt, new Date(now.getTime() - 36 * 3600_000)),
        or(
          eq(feedEvent.type, "birthday"),
          and(eq(feedEvent.type, "moment"), sql`(${feedEvent.payload}->>'firstFlower')::boolean`),
        ),
      ),
    );
  return rows
    .filter((r) => todayIn(timezone, r.createdAt) === today)
    .map((r) => ({ name: r.name, kind: r.type === "birthday" ? ("birthday" as const) : ("firstFlower" as const) }));
}

/**
 * Morning digest: one push per subscription for each user whose local time has
 * reached their push time (within 3 hours of it), who has due tasks (or a plant
 * birthday / first flower today), and who has not been evaluated today. Evaluated once per day.  One user's failure never stops the others.
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
    .select({ id: user.id, locale: user.locale, pushTime: user.pushTime })
    .from(user)
    .where(
      and(
        sql`exists (select 1 from ${pushSubscription} where ${pushSubscription.userId} = ${user.id})`,
        sql`${user.lastDigestOn} is distinct from ${today}`,
      ),
    );

  let sent = 0;
  for (const u of candidates) {
    if (localTime < u.pushTime) continue;
    try {
      // R17: evaluated once per day. Claim atomically before sending so overlapping ticks can't double-send.
      const claimed = await db
        .update(user)
        .set({ lastDigestOn: today })
        .where(and(eq(user.id, u.id), sql`${user.lastDigestOn} is distinct from ${today}`))
        .returning({ id: user.id });
      if (claimed.length === 0) continue;
      // Missed the morning (e.g. cron outage): no late digest.
      if (minutesOf(localTime) - minutesOf(u.pushTime) > LATE_WINDOW_MINUTES) continue;

      const [due, celebrations] = await Promise.all([
        dueTasksForUser(u.id, today),
        celebrationsFor(u.id, today, timezone, now),
      ]);
      // The push stays about care: portrait reminders only show in the app.
      const groups = due
        .map((g) => ({ ...g, tasks: g.tasks.filter((x) => x.type !== "photo") }))
        .filter((g) => g.tasks.length > 0);
      if (groups.length === 0 && celebrations.length === 0) continue;
      const { title, body } = await digestMessage(u.locale, groups, celebrations);
      const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, u.id));
      for (const sub of subs) {
        try {
          const result = await send(sub, { title, body, url: "/" });
          if (result === "gone") {
            await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
          } else {
            sent++;
          }
        } catch (error) {
          console.error(`push send failed for user ${u.id}`, error);
        }
      }
    } catch (error) {
      console.error(`digest failed for user ${u.id}`, error);
    }
  }
  return { sent };
}

/** Creates the initial tasks a plant is missing; existing tasks (and their history) are untouched. */
async function backfillPlant(p: typeof plant.$inferSelect, profile: CareProfile, today: string, hemisphere: "N" | "S") {
  const tasks = initialTasks({ today, acquiredOn: p.acquiredOn, justBought: p.justBought, profile, hemisphere });
  await db
    .insert(careTask)
    .values(tasks.map((t) => ({ plantId: p.id, type: t.type, dueOn: t.dueOn, state: t.state ?? {} })))
    .onConflictDoNothing({ target: [careTask.plantId, careTask.type] });
}

/**
 * One care-profile attempt per pending species per tick, then a backfill pass:
 * alive plants whose species is ready (however it got there: tick, admin Retry,
 * add-plant pre-warm) but that have no fertilize task get their missing initial
 * tasks. Returns the number of profiles that became ready in this tick.
 */
export async function runCareProfileRetries(now: Date = new Date()): Promise<number> {
  const pending = await db
    .select({ id: species.id })
    .from(species)
    .where(eq(species.careProfileStatus, "pending"));

  let ready = 0;
  for (const { id } of pending) {
    try {
      if ((await ensureCareProfile(id)) === "ready") ready++;
    } catch (error) {
      console.error(`care profile retry failed for species ${id}`, error);
    }
  }

  const { timezone, hemisphere } = await homeSettings();
  const today = todayIn(timezone, now);
  const missing = await db
    .select({ plant, profile: species.careProfile })
    .from(plant)
    .innerJoin(species, eq(plant.speciesId, species.id))
    .where(
      and(
        eq(plant.status, "alive"),
        eq(species.careProfileStatus, "ready"),
        sql`not exists (select 1 from ${careTask} where ${careTask.plantId} = ${plant.id} and ${careTask.type} = 'fertilize')`,
      ),
    );
  for (const { plant: p, profile } of missing) {
    const parsed = CareProfile.safeParse(profile);
    if (!parsed.success) {
      console.error(`task backfill skipped for plant ${p.id}: invalid care profile`, parsed.error.message);
      continue;
    }
    try {
      await backfillPlant(p, parsed.data, today, hemisphere);
    } catch (error) {
      console.error(`task backfill failed for plant ${p.id}`, error);
    }
  }
  return ready;
}
