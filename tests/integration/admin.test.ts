import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { group, groupMember, home, plant, spot, user } from "@/db/schema";
import { deleteSpot, saveHome, setAiCap, upsertGroup, upsertSpot } from "@/lib/admin";
import { db, resetDb } from "./setup";

describe("admin lib", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
  });

  it("saveHome stores valid values and rejects bad timezone/hemisphere", async () => {
    await saveHome({ name: "Casa", city: "Sao Paulo", hemisphere: "S", timezone: "America/Sao_Paulo" });
    const [h] = await db.select().from(home);
    expect(h).toMatchObject({ city: "Sao Paulo", hemisphere: "S", timezone: "America/Sao_Paulo" });
    await expect(
      saveHome({ name: "x", city: "x", hemisphere: "N", timezone: "Mars/Olympus" }),
    ).rejects.toThrow();
    await expect(
      saveHome({ name: "x", city: "x", hemisphere: "E" as "N", timezone: "Europe/Madrid" }),
    ).rejects.toThrow();
  });

  it("setAiCap accepts non-negative numbers only", async () => {
    await setAiCap(35.5);
    expect((await db.select().from(home))[0].aiMonthlyCapUsd).toBe("35.50");
    await expect(setAiCap(-1)).rejects.toThrow();
    await expect(setAiCap(Number.NaN)).rejects.toThrow();
  });

  it("upsertGroup creates then replaces the member set", async () => {
    await db.insert(user).values([
      { id: "a", name: "A", email: "a@x.com" },
      { id: "b", name: "B", email: "b@x.com" },
    ]);
    const id = await upsertGroup("Pair", ["a", "b"]);
    await upsertGroup("Solo", ["b"], id);
    const [g] = await db.select().from(group).where(eq(group.id, id));
    expect(g.name).toBe("Solo");
    const members = await db.select().from(groupMember).where(eq(groupMember.groupId, id));
    expect(members.map((m) => m.userId)).toEqual(["b"]);
  });

  it("deleteSpot clears plants' spotId; upsertSpot validates", async () => {
    const id = await upsertSpot({ name: "Sill", lightLevel: "direct", windowDirection: "S" });
    const [g] = await db.insert(group).values({ name: "G" }).returning();
    const [p] = await db
      .insert(plant)
      .values({ groupId: g.id, spotId: id, name: "P", acquiredOn: "2026-10-01" })
      .returning();
    await deleteSpot(id);
    expect((await db.select().from(plant).where(eq(plant.id, p.id)))[0].spotId).toBeNull();
    expect(await db.select().from(spot)).toHaveLength(0);
    await expect(
      upsertSpot({ name: "Bad", lightLevel: "neon" as "low", windowDirection: "N" }),
    ).rejects.toThrow();
  });
});
