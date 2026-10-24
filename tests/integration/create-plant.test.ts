import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, feedEvent, group, groupMember, home, photo, plant, species, user } from "@/db/schema";
import { mockIdentify } from "@/lib/ai/mock";
import { storeDraftPhoto } from "@/lib/photos";
import { createPlantWithTasks } from "@/lib/tasks/create";
import { todayIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const fixture = readFileSync(path.resolve(import.meta.dirname, "../../e2e/fixtures/pilea.jpg"));

describe("createPlantWithTasks (AI_MODE=mock)", () => {
  let Y: string, M: string;
  let ya: string;
  let draftKey: string;

  const input = (over: Partial<Parameters<typeof createPlantWithTasks>[1]> = {}) => ({
    photoKeys: [draftKey],
    scientificName: "Pilea peperomioides",
    commonName: "Chinese money plant",
    name: "Penny",
    persona: mockIdentify.persona,
    groupId: ya,
    spotId: null,
    justBought: true,
    potSizeCm: 12,
    labelPhotoKey: null,
    ...over,
  });

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: "u-y", name: "Yann", email: "y@example.com" },
      { id: "u-m", name: "Marcela", email: "m@example.com" },
    ]);
    [Y, M] = ["u-y", "u-m"];
    const [g1, g2] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    ya = g1.id;
    await db.insert(groupMember).values([
      { groupId: g1.id, userId: Y },
      { groupId: g2.id, userId: M },
    ]);
    draftKey = (
      await storeDraftPhoto(Y, { bytes: fixture, type: "image/jpeg", width: 1, height: 1 })
    ).key;
  });

  it("refuses a group the user cannot see, writing nothing", async () => {
    await expect(createPlantWithTasks(M, input())).rejects.toThrow();
    expect(await db.select().from(plant)).toHaveLength(0);
    expect(await db.select().from(species)).toHaveLength(0);
  });

  it("creates the plant, a cover photo and the full task set", async () => {
    const { plantId } = await createPlantWithTasks(Y, input());

    const [p] = await db.select().from(plant).where(eq(plant.id, plantId));
    expect(p).toMatchObject({ name: "Penny", groupId: ya, justBought: true, potSizeCm: 12 });
    expect(p.acquiredOn).toBe(todayIn("Europe/Madrid"));
    expect(p.speciesId).not.toBeNull();

    const photos = await db.select().from(photo).where(eq(photo.plantId, plantId));
    expect(photos).toHaveLength(1);
    expect(photos[0].objectKey).toBe(draftKey);
    expect(photos[0].userId).toBe(Y);
    expect(photos[0].width).toBeGreaterThan(0);
    expect(photos[0].height).toBeGreaterThan(0);
    expect(p.coverPhotoId).toBe(photos[0].id);

    const types = (await db.select().from(careTask).where(eq(careTask.plantId, plantId)))
      .map((t) => t.type)
      .sort();
    expect(types).toContain("water");
    expect(types).toContain("settle_check");
    expect(types).toContain("fertilize");
  });

  it("creates only the water task when the care profile cannot be generated", async () => {
    // Exhausted attempts: ensureCareProfile reports "failed" without calling the model.
    await db.insert(species).values({
      scientificNameKey: "pilea peperomioides",
      scientificName: "Pilea peperomioides",
      careProfileStatus: "failed",
      profileAttempts: 3,
    });
    const { plantId } = await createPlantWithTasks(Y, input());
    const tasks = await db.select().from(careTask).where(eq(careTask.plantId, plantId));
    expect(tasks.map((t) => t.type)).toEqual(["water"]);
    expect(tasks[0].dueOn).toBe(
      new Date(Date.parse(todayIn("Europe/Madrid")) + 3 * 86400000).toISOString().slice(0, 10),
    );
  });

  it("rejects photo keys that are not drafts and blank names", async () => {
    await expect(createPlantWithTasks(Y, input({ photoKeys: ["photos/x/y.jpg"] }))).rejects.toThrow();
    await expect(createPlantWithTasks(Y, input({ name: "  " }))).rejects.toThrow();
    await expect(createPlantWithTasks(Y, input({ photoKeys: [] }))).rejects.toThrow();
    expect(await db.select().from(plant)).toHaveLength(0);
  });

  it("stores the label photo as kind label and never makes it the cover", async () => {
    const labelKey = (
      await storeDraftPhoto(Y, { bytes: fixture, type: "image/jpeg", width: 1, height: 1 })
    ).key;
    const { plantId } = await createPlantWithTasks(
      Y,
      input({ photoKeys: [labelKey, draftKey], labelPhotoKey: labelKey }),
    );
    const photos = await db.select().from(photo).where(eq(photo.plantId, plantId));
    expect(photos.map((p) => [p.objectKey, p.kind]).sort()).toEqual(
      [[draftKey, "plant"], [labelKey, "label"]].sort(),
    );
    const [p] = await db.select().from(plant).where(eq(plant.id, plantId));
    expect(p.coverPhotoId).toBe(photos.find((x) => x.kind === "plant")!.id);
  });

  it("introduces the new plant with exactly one first post", async () => {
    const { plantId } = await createPlantWithTasks(Y, input());
    const events = await db.select().from(feedEvent).where(eq(feedEvent.plantId, plantId));
    expect(events.map((e) => e.type)).toEqual(["first"]);
    expect(events[0].payload).toMatchObject({ userName: "Yann" });
  });
});
