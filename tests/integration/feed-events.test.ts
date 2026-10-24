import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careTask, feedEvent, group, groupMember, home, moment, plant, user } from "@/db/schema";
import { deleteMoment, logMoment } from "@/lib/feed/events";
import type { MomentType } from "@/lib/feed/types";
import { completeTask } from "@/lib/tasks/complete";
import { db, resetDb } from "./setup";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("feed events", () => {
  const [Y, A, M] = ["u-y", "u-a", "u-m"];
  let plantId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: A, name: "Adriana", email: "a@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [ya, mg] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: Y },
      { groupId: ya.id, userId: A },
      { groupId: mg.id, userId: M },
    ]);
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: ya.id, name: "Pilea", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
  });

  afterEach(() => vi.useRealTimers());

  const addTask = async (type: "water" | "repot") =>
    (await db.insert(careTask).values({ plantId, type, dueOn: "2026-10-25" }).returning({ id: careTask.id }))[0].id;
  const events = (type?: string) =>
    db
      .select()
      .from(feedEvent)
      .where(type ? and(eq(feedEvent.plantId, plantId), eq(feedEvent.type, type)) : eq(feedEvent.plantId, plantId));

  it("thanks only the first care of the day", async () => {
    const taskId = await addTask("water");
    await completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" });
    await completeTask({ userId: A, taskId, expectedVersion: 1, outcome: "still_moist" });

    const thanks = await events("thanks");
    expect(thanks).toHaveLength(1);
    expect(thanks[0].payload).toMatchObject({ userId: Y, userName: "Yann", taskType: "water" });
  });

  it("thanks only the winner of two simultaneous completions", async () => {
    const taskId = await addTask("water");
    const results = await Promise.all([
      completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" }),
      completeTask({ userId: A, taskId, expectedVersion: 0, outcome: "done" }),
    ]);
    const winner = results[0].status === "ok" ? Y : A;

    const thanks = await events("thanks");
    expect(thanks).toHaveLength(1);
    expect(thanks[0].payload).toMatchObject({ userId: winner });
  });

  it("never posts a skip, and a repot posts a repotted moment instead of thanks", async () => {
    const water = await addTask("water");
    await completeTask({ userId: Y, taskId: water, expectedVersion: 0, outcome: "skipped" });
    expect(await events()).toHaveLength(0);

    const repot = await addTask("repot");
    await completeTask({ userId: Y, taskId: repot, expectedVersion: 0, outcome: "done" });
    expect(await events("thanks")).toHaveLength(0);
    const moments = await events("moment");
    expect(moments).toHaveLength(1);
    expect(moments[0].payload).toMatchObject({ momentType: "repotted", userName: "Yann" });
  });

  it("counts the thanks-per-day rule on Madrid days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const taskId = await addTask("water");
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z")); // 10 Nov in Madrid
    await completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" });
    vi.setSystemTime(new Date("2026-11-10T23:30:00Z")); // already 11 Nov in Madrid
    await completeTask({ userId: A, taskId, expectedVersion: 1, outcome: "done" });

    expect(await events("thanks")).toHaveLength(2);
  });

  it("marks only the first flower as a first flower", async () => {
    await logMoment(Y, plantId, "flower", null);
    await logMoment(Y, plantId, "flower", null);
    const flowers = (await events("moment")).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    expect(flowers.map((e) => e.payload.firstFlower)).toEqual([true, false]);
    expect(flowers[0].payload.mood).toBe("proud");
  });

  it("lets only the author delete a moment, and its post goes with it", async () => {
    const { momentId } = await logMoment(Y, plantId, "flower", null);

    await expect(deleteMoment(A, momentId)).rejects.toMatchObject(NOT_FOUND);
    expect(await db.select().from(moment)).toHaveLength(1);
    expect(await events("moment")).toHaveLength(1);

    await deleteMoment(Y, momentId);
    expect(await db.select().from(moment)).toHaveLength(0);
    expect(await events("moment")).toHaveLength(0);
  });

  it("refuses moments on plants outside the user's groups", async () => {
    await expect(logMoment(M, plantId, "new_leaf", null)).rejects.toMatchObject(NOT_FOUND);
    expect(await db.select().from(moment)).toHaveLength(0);
    expect(await events()).toHaveLength(0);
  });

  it("rejects moment types the app doesn't know, writing nothing", async () => {
    await expect(logMoment(Y, plantId, "banana" as MomentType, null)).rejects.toThrow();
    expect(await db.select().from(moment)).toHaveLength(0);
    expect(await events()).toHaveLength(0);
  });
});
