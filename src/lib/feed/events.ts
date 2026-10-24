import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { careTask, feedEvent, home, moment, photo, user } from "@/db/schema";
import { getPlantForUser } from "@/lib/access";
import { seasonOf } from "@/lib/care/season";
import type { TaskOutcome, TaskType } from "@/lib/care/types";
import { todayIn } from "@/lib/time";
import { moodOf } from "./mood";
import { MOMENT_TYPES, type MomentType, type Mood, type PayloadOf, type PostType } from "./types";

async function homeSettings() {
  const [row] = await db.select({ timezone: home.timezone, hemisphere: home.hemisphere }).from(home).limit(1);
  return { timezone: row?.timezone ?? "Europe/Madrid", hemisphere: row?.hemisphere ?? ("N" as const) };
}

export async function userName(userId: string): Promise<string> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  return row?.name ?? "";
}

/** The plant's mood right now, from its care tasks, latest moment and the season. */
export async function currentMood(plantId: string, today?: string): Promise<Mood> {
  const { timezone, hemisphere } = await homeSettings();
  const day = today ?? todayIn(timezone);
  const [tasks, [latest]] = await Promise.all([
    db
      .select({ type: careTask.type, dueOn: careTask.dueOn, active: careTask.active })
      .from(careTask)
      .where(eq(careTask.plantId, plantId)),
    db
      .select({ createdAt: moment.createdAt })
      .from(moment)
      .where(eq(moment.plantId, plantId))
      .orderBy(desc(moment.createdAt))
      .limit(1),
  ]);
  return moodOf({
    today: day,
    season: seasonOf(day, hemisphere),
    tasks,
    lastMomentOn: latest ? todayIn(timezone, latest.createdAt) : null,
  });
}

/** Stores one post in neutral form, stamped with the plant's mood at that moment. */
export async function createEvent<T extends PostType>(
  plantId: string,
  type: T,
  fields: Omit<PayloadOf<T>, "type" | "mood">,
  opts: { createdAt?: Date } = {},
): Promise<string> {
  const mood = await currentMood(plantId);
  const [row] = await db
    .insert(feedEvent)
    // createdAt from the app clock (not the DB's) so day boundaries follow the home timezone consistently
    .values({ plantId, type, payload: { ...fields, type, mood }, createdAt: opts.createdAt ?? new Date() })
    .returning({ id: feedEvent.id });
  return row.id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNTHANKED_TASKS: ReadonlySet<TaskType> = new Set<TaskType>(["photo", "repot"]);

/** A thank-you post for care, at most one per plant per home-timezone day. */
export async function recordThanks(input: {
  plantId: string;
  userId: string;
  taskType: TaskType;
  outcome: TaskOutcome;
}): Promise<string | null> {
  const { plantId, userId, taskType, outcome } = input;
  if (outcome === "skipped" || UNTHANKED_TASKS.has(taskType)) return null;

  const { timezone } = await homeSettings();
  const today = todayIn(timezone);
  const recent = await db
    .select({ createdAt: feedEvent.createdAt })
    .from(feedEvent)
    .where(
      and(
        eq(feedEvent.plantId, plantId),
        eq(feedEvent.type, "thanks"),
        gte(feedEvent.createdAt, new Date(Date.now() - 2 * 24 * 3600_000)),
      ),
    );
  if (recent.some((e) => todayIn(timezone, e.createdAt) === today)) return null;

  return createEvent(plantId, "thanks", { userId, userName: await userName(userId), taskType });
}

/** Logs a growth moment and its post. The plant must be in one of the user's groups. */
export async function logMoment(
  userId: string,
  plantId: string,
  momentType: MomentType,
  photoId: string | null,
): Promise<{ momentId: string; eventId: string }> {
  // The type comes from the browser; an unknown one would break every reader's feed.
  if (!MOMENT_TYPES.includes(momentType)) throw new Error(`Unknown moment type: ${String(momentType)}`);
  await getPlantForUser(userId, plantId);
  const [{ flowers }] = await db
    .select({ flowers: sql<number>`count(*)::int` })
    .from(moment)
    .where(and(eq(moment.plantId, plantId), eq(moment.type, "flower")));
  const [created] = await db
    .insert(moment)
    .values({ plantId, userId, type: momentType, photoId, createdAt: new Date() })
    .returning({ id: moment.id });
  const eventId = await createEvent(plantId, "moment", {
    momentId: created.id,
    momentType,
    photoId,
    userName: await userName(userId),
    firstFlower: momentType === "flower" && flowers === 0,
  });
  return { momentId: created.id, eventId };
}

/** Undo for a mis-tapped moment: only its author can delete it, and its post goes too. */
export async function deleteMoment(userId: string, momentId: string): Promise<void> {
  if (!UUID.test(momentId)) notFound();
  const [row] = await db.select().from(moment).where(eq(moment.id, momentId));
  if (!row || row.userId !== userId) notFound();
  await getPlantForUser(userId, row.plantId);
  const removed = await db.transaction(async (tx) => {
    const events = await tx
      .delete(feedEvent)
      .where(
        and(
          eq(feedEvent.plantId, row.plantId),
          eq(feedEvent.type, "moment"),
          sql`${feedEvent.payload}->>'momentId' = ${momentId}`,
        ),
      )
      .returning({ createdAt: feedEvent.createdAt });
    await tx.delete(moment).where(eq(moment.id, momentId));
    return events;
  });

  // One action, one post: a photo that came with the undone moment gets its own post back.
  if (row.photoId) {
    const [taken] = await db.select({ takenAt: photo.takenAt }).from(photo).where(eq(photo.id, row.photoId));
    if (!taken) return;
    const [previous] = await db
      .select({ takenAt: photo.takenAt })
      .from(photo)
      .where(and(eq(photo.plantId, row.plantId), eq(photo.kind, "plant"), lt(photo.takenAt, taken.takenAt)))
      .orderBy(desc(photo.takenAt))
      .limit(1);
    await createEvent(
      row.plantId,
      "photo",
      {
        photoId: row.photoId,
        userName: await userName(row.userId),
        previousPhotoAt: previous ? previous.takenAt.toISOString() : null,
      },
      { createdAt: removed[0]?.createdAt },
    );
  }
}

/** The self-introduction of a newly added plant. */
export async function recordFirst(plantId: string, userId: string): Promise<string> {
  return createEvent(plantId, "first", { userName: await userName(userId) });
}
