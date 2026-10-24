import { and, desc, eq, gte, inArray, lt, max } from "drizzle-orm";
import { db } from "@/db/client";
import { careTask, feedEvent, feedText, home, moment, photo, plant, user } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { visibleGroupIds } from "@/lib/access";
import { seasonOf } from "@/lib/care/season";
import { signedUrl } from "@/lib/storage";
import { coverUrls } from "@/lib/tasks/queries";
import { todayIn } from "@/lib/time";
import { pickHighlights } from "./highlights";
import { moodOf } from "./mood";
import { renderPostText } from "./text";
import type { MomentType, Mood, PostPayload, PostType } from "./types";

export type FeedPost = {
  id: string;
  type: PostType;
  createdAt: Date;
  text: string;
  /** The plant's mood when the event happened. */
  mood: Mood;
  plant: { id: string; name: string; coverUrl: string | null };
  photoUrl: string | null;
};

const HIGHLIGHT_WINDOW_DAYS = 30;
const PAGE_SIZE = 20;

/**
 * The news a user may read: events of alive plants whose *current* group is
 * one of the user's groups, so posts follow a plant that changes group.
 */
export async function feedForUser(
  userId: string,
  locale: Locale,
  opts: { mode: "highlights" } | { mode: "all"; before?: Date; limit?: number },
): Promise<FeedPost[]> {
  const groupIds = await visibleGroupIds(userId);
  if (groupIds.length === 0) return [];

  const visible = and(inArray(plant.groupId, groupIds), eq(plant.status, "alive"));
  const window =
    opts.mode === "highlights"
      ? gte(feedEvent.createdAt, new Date(Date.now() - HIGHLIGHT_WINDOW_DAYS * 24 * 3600_000))
      : opts.before
        ? lt(feedEvent.createdAt, opts.before)
        : undefined;

  const rows = await db
    .select({ event: feedEvent, plant, text: feedText.text })
    .from(feedEvent)
    .innerJoin(plant, eq(plant.id, feedEvent.plantId))
    .leftJoin(feedText, and(eq(feedText.eventId, feedEvent.id), eq(feedText.locale, locale)))
    .where(and(visible, window))
    .orderBy(desc(feedEvent.createdAt), desc(feedEvent.id))
    .limit(opts.mode === "highlights" ? 200 : (opts.limit ?? PAGE_SIZE));

  let chosen = rows.map((r) => ({ ...r, type: r.event.type as PostType, createdAt: r.event.createdAt }));
  if (opts.mode === "highlights") {
    chosen = pickHighlights(chosen, new Date());
    if (chosen.length === 0) {
      // Nothing in the window: the latest few, whatever their age.
      const older = await feedForUser(userId, locale, { mode: "all", limit: 3 });
      return older;
    }
  }
  return toPosts(chosen, locale);
}

async function toPosts(
  rows: { event: typeof feedEvent.$inferSelect; plant: typeof plant.$inferSelect; text: string | null }[],
  locale: Locale,
): Promise<FeedPost[]> {
  const plants = [...new Map(rows.map((r) => [r.plant.id, r.plant])).values()];
  const covers = await coverUrls(plants);

  const photoIds = rows.flatMap((r) => {
    const p = r.event.payload as PostPayload;
    return (p.type === "photo" || p.type === "moment") && p.photoId ? [p.photoId] : [];
  });
  const keys = photoIds.length
    ? new Map(
        (await db.select({ id: photo.id, key: photo.objectKey }).from(photo).where(inArray(photo.id, photoIds))).map(
          (r) => [r.id, r.key],
        ),
      )
    : new Map<string, string>();

  return Promise.all(
    rows.map(async (r) => {
      const payload = r.event.payload as PostPayload;
      const photoId = (payload.type === "photo" || payload.type === "moment") && payload.photoId;
      const key = photoId ? keys.get(photoId) : undefined;
      return {
        id: r.event.id,
        type: r.event.type as PostType,
        createdAt: r.event.createdAt,
        text: renderPostText({ type: r.event.type as PostType, payload, plantName: r.plant.name }, locale, r.text),
        mood: payload.mood ?? "happy",
        plant: { id: r.plant.id, name: r.plant.name, coverUrl: covers.get(r.plant.id) ?? null },
        photoUrl: key ? await signedUrl(key) : null,
      };
    }),
  );
}

/** Current moods for several plants at once (for avatars). */
export async function currentMoods(plantIds: string[], today?: string): Promise<Map<string, Mood>> {
  const out = new Map<string, Mood>();
  if (plantIds.length === 0) return out;
  const [homeRow] = await db.select({ timezone: home.timezone, hemisphere: home.hemisphere }).from(home).limit(1);
  const tz = homeRow?.timezone ?? "Europe/Madrid";
  const day = today ?? todayIn(tz);
  const season = seasonOf(day, homeRow?.hemisphere ?? "N");

  const [tasks, moments] = await Promise.all([
    db
      .select({ plantId: careTask.plantId, type: careTask.type, dueOn: careTask.dueOn, active: careTask.active })
      .from(careTask)
      .where(inArray(careTask.plantId, plantIds)),
    db
      .select({ plantId: moment.plantId, last: max(moment.createdAt) })
      .from(moment)
      .where(inArray(moment.plantId, plantIds))
      .groupBy(moment.plantId),
  ]);
  const lastMoment = new Map(moments.map((m) => [m.plantId, m.last]));
  for (const id of plantIds) {
    const last = lastMoment.get(id);
    out.set(
      id,
      moodOf({
        today: day,
        season,
        tasks: tasks.filter((t) => t.plantId === id),
        lastMomentOn: last ? todayIn(tz, last) : null,
      }),
    );
  }
  return out;
}

export type MomentItem = { id: string; type: MomentType; userId: string; userName: string; createdAt: Date };

/** A plant's latest growth moments with who logged them. Callers have already checked access. */
export async function recentMoments(plantId: string, limit = 10): Promise<MomentItem[]> {
  const rows = await db
    .select({ id: moment.id, type: moment.type, userId: moment.userId, userName: user.name, createdAt: moment.createdAt })
    .from(moment)
    .innerJoin(user, eq(user.id, moment.userId))
    .where(eq(moment.plantId, plantId))
    .orderBy(desc(moment.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, type: r.type as MomentType }));
}
