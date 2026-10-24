import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, group, groupMember, home, plant, spot, taskCompletion, user } from "@/db/schema";
import { householdContext, plantContext } from "@/lib/gardener/context";
import { applySuggestion } from "@/lib/gardener/suggestions";
import { db, resetDb } from "./setup";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("gardener context and suggestions", () => {
  const [Y, M] = ["u-y", "u-m"];
  let plantId: string, bedroom: string, livingRoom: string;

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
    [{ id: bedroom }, { id: livingRoom }] = await db
      .insert(spot)
      .values([
        { name: "Bedroom", lightLevel: "low", windowDirection: "N" },
        { name: "Living room window", lightLevel: "bright_indirect", windowDirection: "S" },
      ])
      .returning({ id: spot.id });
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: ya.id, spotId: bedroom, name: "Ficus", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
    const [task] = await db
      .insert(careTask)
      .values({ plantId, type: "water", dueOn: "2026-11-30" })
      .returning({ id: careTask.id });
    for (let i = 0; i < 3; i++)
      await db.insert(taskCompletion).values({
        taskId: task.id, plantId, type: "water", userId: Y, outcome: "still_moist",
        completedAt: new Date(Date.UTC(2026, 10, 10 + i)),
      });
  });

  it("knows the plant's spot and recent care", async () => {
    const ctx = await plantContext(plantId);
    expect(ctx.name).toBe("Ficus");
    expect(ctx.spot?.name).toBe("Bedroom");
    expect(ctx.spot?.lightLevel).toBe("low");
    expect(ctx.completions.filter((c) => c.outcome === "still_moist")).toHaveLength(3);
  });

  it("shows each person only their plants, and every home spot", async () => {
    const forM = await householdContext(M);
    expect(forM.plants.map((p) => p.name)).not.toContain("Ficus");
    expect(forM.spots.map((s) => s.name).sort()).toEqual(["Bedroom", "Living room window"]);
    expect((await householdContext(Y)).plants.map((p) => p.name)).toEqual(["Ficus"]);
  });

  it("applies a watering suggestion once", async () => {
    expect(await applySuggestion(Y, plantId, { kind: "water", days: 10 })).toBe("applied");
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].waterIntervalOverrideDays).toBe(10);
    expect(await applySuggestion(Y, plantId, { kind: "water", days: 10 })).toBe("same");
  });

  it("moves the plant to an existing spot, and says when the spot is gone", async () => {
    expect(await applySuggestion(Y, plantId, { kind: "spot", spotId: livingRoom, spotName: "Living room window" })).toBe(
      "applied",
    );
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].spotId).toBe(livingRoom);

    await db.delete(spot).where(eq(spot.id, bedroom));
    expect(await applySuggestion(Y, plantId, { kind: "spot", spotId: bedroom, spotName: "Bedroom" })).toBe("gone");
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].spotId).toBe(livingRoom);
    expect(await applySuggestion(Y, plantId, { kind: "spot", spotId: "not-a-spot", spotName: "?" })).toBe("gone");
  });

  it("refuses other groups' plants and nonsense intervals", async () => {
    await expect(applySuggestion(M, plantId, { kind: "water", days: 10 })).rejects.toMatchObject(NOT_FOUND);
    await expect(applySuggestion(Y, plantId, { kind: "water", days: 0 })).rejects.toThrow();
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].waterIntervalOverrideDays).toBeNull();
  });
});
