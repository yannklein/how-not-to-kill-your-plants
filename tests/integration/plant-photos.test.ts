import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, feedEvent, group, groupMember, home, photo, plant, user } from "@/db/schema";
import { storeDraftPhoto } from "@/lib/photos";
import { deleteMoment } from "@/lib/feed/events";
import { addPlantPhoto, plantTimeline } from "@/lib/plants/photos";
import { addMonths, todayIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const fixture = readFileSync(path.resolve(import.meta.dirname, "../../e2e/fixtures/pilea.jpg"));
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("addPlantPhoto", () => {
  const [Y, M] = ["u-y", "u-m"];
  let plantId: string;

  const draft = async () =>
    (await storeDraftPhoto(Y, { bytes: fixture, type: "image/jpeg", width: 1, height: 1 })).key;
  const events = (type: string) =>
    db.select().from(feedEvent).where(and(eq(feedEvent.plantId, plantId), eq(feedEvent.type, type)));

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [ya, mg] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: Y },
      { groupId: mg.id, userId: M },
    ]);
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: ya.id, name: "Pilea", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
    await db.insert(careTask).values({ plantId, type: "photo", dueOn: "2026-10-20" });
  });

  it("adds a plant photo, makes it the cover, resets the portrait task and posts once", async () => {
    const { photoId } = await addPlantPhoto(Y, plantId, await draft(), null);

    const [p] = await db.select().from(plant).where(eq(plant.id, plantId));
    expect(p.coverPhotoId).toBe(photoId);
    const [ph] = await db.select().from(photo).where(eq(photo.id, photoId));
    expect(ph.kind).toBe("plant");
    expect(ph.width).toBeGreaterThan(1);

    const [task] = await db
      .select()
      .from(careTask)
      .where(and(eq(careTask.plantId, plantId), eq(careTask.type, "photo")));
    expect(task.dueOn).toBe(addMonths(todayIn("Europe/Madrid"), 1));
    expect(task.active).toBe(true);
    expect(task.version).toBe(1);

    const photos = await events("photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].payload).toMatchObject({ photoId, userName: "Yann", previousPhotoAt: null });
    expect(await events("moment")).toHaveLength(0);
  });

  it("posts the moment, with the photo attached, instead of a photo post", async () => {
    const { photoId } = await addPlantPhoto(Y, plantId, await draft(), "new_leaf");

    const moments = await events("moment");
    expect(moments).toHaveLength(1);
    expect(moments[0].payload).toMatchObject({ momentType: "new_leaf", photoId });
    expect(await events("photo")).toHaveLength(0);
  });

  it("remembers when the previous photo was taken", async () => {
    await addPlantPhoto(Y, plantId, await draft(), null);
    await addPlantPhoto(Y, plantId, await draft(), null);
    const payloads = (await events("photo")).map((e) => e.payload.previousPhotoAt);
    expect(payloads.filter((x) => x !== null)).toHaveLength(1);
  });

  it("refuses plants outside the user's groups, writing nothing", async () => {
    await expect(addPlantPhoto(M, plantId, await draft(), null)).rejects.toMatchObject(NOT_FOUND);
    expect(await db.select().from(photo)).toHaveLength(0);
  });

  it("lists only plant photos on the timeline, newest first", async () => {
    await db.insert(photo).values({
      plantId, userId: Y, objectKey: "photos/draft/label.jpg", width: 1, height: 1, kind: "label",
    });
    const first = await addPlantPhoto(Y, plantId, await draft(), null);
    const second = await addPlantPhoto(Y, plantId, await draft(), null);

    const timeline = await plantTimeline(plantId);
    expect(timeline.map((t) => t.id)).toEqual([second.photoId, first.photoId]);
    expect(timeline[0].url).toMatch(/^http/);
  });

  it("keeps the photo's post when its moment is undone", async () => {
    const { photoId } = await addPlantPhoto(Y, plantId, await draft(), "flower");
    const [ev] = await events("moment");
    await deleteMoment(Y, (ev.payload as { momentId: string }).momentId);

    expect(await events("moment")).toHaveLength(0);
    const photos = await events("photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].payload).toMatchObject({ photoId, userName: "Yann" });
  });
});
