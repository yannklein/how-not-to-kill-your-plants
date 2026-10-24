import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, group, groupMember, plant, taskCompletion, user } from "@/db/schema";
import { completeTask } from "@/lib/tasks/complete";
import { db, resetDb } from "./setup";

describe("completeTask", () => {
  let Y: string, A: string, M: string;
  let plantId: string;
  let taskId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(user).values([
      { id: "u-y", name: "Yann", email: "y@example.com" },
      { id: "u-a", name: "Adriana", email: "a@example.com" },
      { id: "u-m", name: "Marcela", email: "m@example.com" },
    ]);
    [Y, A, M] = ["u-y", "u-a", "u-m"];
    const [ya, mg] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: Y },
      { groupId: ya.id, userId: A },
      { groupId: mg.id, userId: M },
    ]);
    const [p] = await db
      .insert(plant)
      .values({ groupId: ya.id, name: "Pilea", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
    plantId = p.id;
    const [t] = await db
      .insert(careTask)
      .values({ plantId, type: "water", dueOn: "2026-10-25" })
      .returning({ id: careTask.id });
    taskId = t.id;
  });

  it("lets exactly one of two concurrent completions win", async () => {
    const results = await Promise.all([
      completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" }),
      completeTask({ userId: A, taskId, expectedVersion: 0, outcome: "done" }),
    ]);
    const ok = results.filter((r) => r.status === "ok");
    const lost = results.filter((r) => r.status === "already_done");
    expect(ok).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const winnerId = results[0].status === "ok" ? Y : A;
    const loser = lost[0];
    if (loser.status !== "already_done") throw new Error("unreachable");
    expect(loser.by.name).toBe(winnerId === Y ? "Yann" : "Adriana");

    const completions = await db.select().from(taskCompletion);
    expect(completions).toHaveLength(1);
    expect(completions[0].userId).toBe(winnerId);
    const [task] = await db.select().from(careTask).where(eq(careTask.id, taskId));
    expect(task.version).toBe(1);
  });

  it("reports the earlier completer on a stale version", async () => {
    await completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" });
    const r = await completeTask({ userId: A, taskId, expectedVersion: 0, outcome: "done" });
    expect(r).toMatchObject({ status: "already_done", by: { name: "Yann" } });
  });

  it("throws not-found for a non-member and writes nothing", async () => {
    await expect(
      completeTask({ userId: M, taskId, expectedVersion: 0, outcome: "done" }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(await db.select().from(taskCompletion)).toHaveLength(0);
    const [task] = await db.select().from(careTask).where(eq(careTask.id, taskId));
    expect(task.version).toBe(0);
  });

  it("rejects an outcome the task type does not accept, without writing", async () => {
    await expect(
      completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "rootbound_yes" }),
    ).rejects.toMatchObject({ name: "InvalidOutcomeError" });
    expect(await db.select().from(taskCompletion)).toHaveLength(0);
  });

  it("settle_check deactivates itself and spawns (or revives) a repot", async () => {
    const [s] = await db
      .insert(careTask)
      .values({ plantId, type: "settle_check", dueOn: "2026-11-07" })
      .returning({ id: careTask.id });
    await db.insert(careTask).values({ plantId, type: "repot", dueOn: "2030-01-01", active: false });

    const r = await completeTask({ userId: A, taskId: s.id, expectedVersion: 0, outcome: "rootbound_yes" });
    expect(r).toEqual({ status: "ok", nextDueOn: null });

    const [settle] = await db.select().from(careTask).where(eq(careTask.id, s.id));
    expect(settle.active).toBe(false);
    const tasks = await db.select().from(careTask).where(eq(careTask.plantId, plantId));
    const repot = tasks.find((t) => t.type === "repot")!;
    expect(repot.active).toBe(true);
    expect(repot.dueOn).not.toBe("2030-01-01");

    const again = await completeTask({ userId: Y, taskId: s.id, expectedVersion: 1, outcome: "rootbound_no" });
    expect(again).toMatchObject({ status: "already_done", by: { name: "Adriana" } });
  });

  it("stores watering state and reschedules", async () => {
    const r = await completeTask({ userId: Y, taskId, expectedVersion: 0, outcome: "done" });
    expect(r.status).toBe("ok");
    const [task] = await db.select().from(careTask).where(eq(careTask.id, taskId));
    expect(task.state).toMatchObject({ moistCount: 0 });
    expect((task.state as { lastWateredOn: string }).lastWateredOn).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
});
