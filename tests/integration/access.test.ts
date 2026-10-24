import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, group, groupMember, plant, user } from "@/db/schema";
import {
  getPlantForUser,
  getTaskForUser,
  listPlantsForUser,
  visibleGroupIds,
} from "@/lib/access";
import { db, resetDb } from "./setup";

function expectNotFound(p: Promise<unknown>) {
  return expect(p).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

describe("group-based access", () => {
  let ids: Record<"Y" | "A" | "M", string>;
  let plants: Record<"ya" | "m" | "all", { id: string }>;
  let yaWaterTaskId: string;

  beforeEach(async () => {
    await resetDb();
    const users = await db
      .insert(user)
      .values([
        { id: "u-y", name: "Y", email: "y@example.com" },
        { id: "u-a", name: "A", email: "a@example.com" },
        { id: "u-m", name: "M", email: "m@example.com" },
      ])
      .returning({ id: user.id });
    ids = { Y: users[0].id, A: users[1].id, M: users[2].id };

    const [ya, m, all] = await db
      .insert(group)
      .values([{ name: "YA" }, { name: "M" }, { name: "ALL" }])
      .returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: ids.Y },
      { groupId: ya.id, userId: ids.A },
      { groupId: m.id, userId: ids.M },
      { groupId: all.id, userId: ids.Y },
      { groupId: all.id, userId: ids.A },
      { groupId: all.id, userId: ids.M },
    ]);
    const rows = await db
      .insert(plant)
      .values([
        { groupId: ya.id, name: "ya-plant", acquiredOn: "2026-10-01" },
        { groupId: m.id, name: "m-plant", acquiredOn: "2026-10-01" },
        { groupId: all.id, name: "all-plant", acquiredOn: "2026-10-01" },
      ])
      .returning({ id: plant.id });
    plants = { ya: rows[0], m: rows[1], all: rows[2] };
    const [task] = await db
      .insert(careTask)
      .values({ plantId: plants.ya.id, type: "water", dueOn: "2026-10-25" })
      .returning({ id: careTask.id });
    yaWaterTaskId = task.id;
  });

  it("visibleGroupIds returns the user's groups", async () => {
    expect(await visibleGroupIds(ids.M)).toHaveLength(2);
    expect(await visibleGroupIds(ids.Y)).toHaveLength(2);
  });

  it("lists only plants in the user's groups", async () => {
    const list = await listPlantsForUser(ids.M);
    expect(list.map((p) => p.id).sort()).toEqual([plants.m.id, plants.all.id].sort());
  });

  it("getPlantForUser returns visible plants and 404s otherwise", async () => {
    expect((await getPlantForUser(ids.Y, plants.ya.id)).name).toBe("ya-plant");
    await expectNotFound(getPlantForUser(ids.M, plants.ya.id));
    await expectNotFound(getPlantForUser(ids.M, "00000000-0000-0000-0000-000000000000"));
    await expectNotFound(getPlantForUser(ids.M, "not-a-uuid"));
  });

  it("getTaskForUser returns task with plant and 404s otherwise", async () => {
    const t = await getTaskForUser(ids.A, yaWaterTaskId);
    expect(t.plant.id).toBe(plants.ya.id);
    await expectNotFound(getTaskForUser(ids.M, yaWaterTaskId));
  });

  it("hides inactive plants unless includeInactive", async () => {
    await db.update(plant).set({ status: "dead" }).where(eq(plant.id, plants.ya.id));
    const names = (await listPlantsForUser(ids.Y)).map((p) => p.name);
    expect(names).not.toContain("ya-plant");
    const all = (await listPlantsForUser(ids.Y, { includeInactive: true })).map((p) => p.name);
    expect(all).toContain("ya-plant");
  });
});
