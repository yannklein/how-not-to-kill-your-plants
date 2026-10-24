import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, group, groupMember, plant, user } from "@/db/schema";
import { dueTasksForUser, upcomingTasksForPlant } from "@/lib/tasks/queries";
import { db, resetDb } from "./setup";

describe("dueTasksForUser", () => {
  let ids: { M: string };
  let p: Record<string, string>;

  beforeEach(async () => {
    await resetDb();
    await db.insert(user).values([
      { id: "u-y", name: "Y", email: "y@example.com" },
      { id: "u-m", name: "M", email: "m@example.com" },
    ]);
    ids = { M: "u-m" };
    const [ya, m, all] = await db
      .insert(group)
      .values([{ name: "YA" }, { name: "M" }, { name: "ALL" }])
      .returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: "u-y" },
      { groupId: m.id, userId: "u-m" },
      { groupId: all.id, userId: "u-y" },
      { groupId: all.id, userId: "u-m" },
    ]);
    const rows = await db
      .insert(plant)
      .values([
        { groupId: ya.id, name: "ya-plant", acquiredOn: "2026-10-01" },
        { groupId: m.id, name: "m-today", acquiredOn: "2026-10-01" },
        { groupId: all.id, name: "all-overdue", acquiredOn: "2026-10-01" },
        { groupId: m.id, name: "m-dead", acquiredOn: "2026-10-01", status: "dead" },
        { groupId: m.id, name: "m-future", acquiredOn: "2026-10-01" },
      ])
      .returning({ id: plant.id, name: plant.name });
    p = Object.fromEntries(rows.map((r) => [r.name, r.id]));
    await db.insert(careTask).values([
      { plantId: p["ya-plant"], type: "water", dueOn: "2026-11-01" },
      { plantId: p["m-today"], type: "water", dueOn: "2026-11-08" },
      { plantId: p["all-overdue"], type: "water", dueOn: "2026-11-05" },
      { plantId: p["all-overdue"], type: "rotate", dueOn: "2026-11-07" },
      { plantId: p["m-dead"], type: "water", dueOn: "2026-11-01" },
      { plantId: p["m-future"], type: "water", dueOn: "2026-11-09" },
      { plantId: p["m-future"], type: "rotate", dueOn: "2026-11-01", active: false },
    ]);
  });

  it("returns only due, active tasks of alive plants in the user's groups, most overdue first", async () => {
    const groups = await dueTasksForUser(ids.M, "2026-11-08");
    expect(groups.map((g) => g.plant.name)).toEqual(["all-overdue", "m-today"]);
    expect(groups[0].plant.coverUrl).toBeNull();
    const water = groups[0].tasks.find((t) => t.type === "water")!;
    expect(water.overdueDays).toBe(3);
    expect(groups[0].tasks.find((t) => t.type === "rotate")!.overdueDays).toBe(1);
    expect(groups[1].tasks.map((t) => t.overdueDays)).toEqual([0]);
  });

  it("breaks ties by plant name", async () => {
    await db.insert(careTask).values({ plantId: p["m-future"], type: "dust", dueOn: "2026-11-08" });
    await db.update(careTask).set({ dueOn: "2026-11-08" }).where(
      eq(careTask.plantId, p["all-overdue"]),
    );
    const groups = await dueTasksForUser(ids.M, "2026-11-08");
    expect(groups.map((g) => g.plant.name)).toEqual(["all-overdue", "m-future", "m-today"]);
  });

  it("never lets an old portrait reminder outrank care", async () => {
    await db.insert(careTask).values({ plantId: p["m-future"], type: "photo", dueOn: "2026-10-01" });
    const groups = await dueTasksForUser(ids.M, "2026-11-08");
    expect(groups.map((g) => g.plant.name)).toEqual(["all-overdue", "m-today", "m-future"]);
  });
});

describe("upcomingTasksForPlant", () => {
  it("returns active tasks by due date, limited", async () => {
    await resetDb();
    const [g] = await db.insert(group).values({ name: "G" }).returning({ id: group.id });
    const [pl] = await db
      .insert(plant)
      .values({ groupId: g.id, name: "x", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
    await db.insert(careTask).values([
      { plantId: pl.id, type: "water", dueOn: "2026-11-03" },
      { plantId: pl.id, type: "rotate", dueOn: "2026-11-01" },
      { plantId: pl.id, type: "dust", dueOn: "2026-11-02" },
      { plantId: pl.id, type: "mist", dueOn: "2026-11-01", active: false },
    ]);
    const tasks = await upcomingTasksForPlant(pl.id, 2);
    expect(tasks.map((t) => t.type)).toEqual(["rotate", "dust"]);
  });
});
