import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, group, home, photo, plant, user } from "@/db/schema";
import { backfillPhotoTasks } from "@/lib/feed/cron";
import { db, resetDb } from "./setup";

describe("backfillPhotoTasks", () => {
  let groupId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values({ id: "u-y", name: "Yann", email: "y@example.com" });
    [{ id: groupId }] = await db.insert(group).values({ name: "YA" }).returning({ id: group.id });
  });

  async function seedPlant(createdAt: Date) {
    const [p] = await db
      .insert(plant)
      .values({ groupId, name: "Penny", acquiredOn: "2026-10-24", createdAt })
      .returning();
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-10-27" });
    return p;
  }

  const photoTask = (plantId: string) =>
    db.select().from(careTask).where(and(eq(careTask.plantId, plantId), eq(careTask.type, "photo")));

  it("adds a portrait task a month after the latest plant photo, once", async () => {
    const p = await seedPlant(new Date("2026-10-20T10:00:00Z"));
    await db.insert(photo).values({
      plantId: p.id, userId: "u-y", objectKey: "photos/a.jpg", width: 1, height: 1,
      takenAt: new Date("2026-10-24T10:00:00Z"),
    });

    expect(await backfillPhotoTasks()).toBe(1);
    expect((await photoTask(p.id))[0]?.dueOn).toBe("2026-11-24");
    expect(await backfillPhotoTasks()).toBe(0);
  });

  it("uses the day the plant joined when it only has a label photo", async () => {
    const p = await seedPlant(new Date("2026-10-22T10:00:00Z"));
    await db.insert(photo).values({
      plantId: p.id, userId: "u-y", objectKey: "photos/l.jpg", width: 1, height: 1, kind: "label",
      takenAt: new Date("2026-10-24T10:00:00Z"),
    });

    await backfillPhotoTasks();
    expect((await photoTask(p.id))[0]?.dueOn).toBe("2026-11-22");
  });

  it("skips plants that are not alive", async () => {
    const p = await seedPlant(new Date("2026-10-20T10:00:00Z"));
    await db.update(plant).set({ status: "dead" }).where(eq(plant.id, p.id));
    expect(await backfillPhotoTasks()).toBe(0);
  });
});
