import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "./setup";
import { careTask, group, home, plant, species } from "@/db/schema";

beforeEach(resetDb);

describe("schema", () => {
  async function seedPlant() {
    await db.insert(home).values({});
    const [g] = await db.insert(group).values({ name: "Yann" }).returning();
    const [s] = await db
      .insert(species)
      .values({ scientificNameKey: "monstera deliciosa", scientificName: "Monstera deliciosa" })
      .returning();
    const [p] = await db
      .insert(plant)
      .values({ groupId: g.id, speciesId: s.id, name: "Monty", acquiredOn: "2026-10-24" })
      .returning();
    return p;
  }

  it("defaults plant.status to alive", async () => {
    const p = await seedPlant();
    expect(p.status).toBe("alive");
  });

  it("rejects a second care_task with the same (plantId, type)", async () => {
    const p = await seedPlant();
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-10-31" });
    await expect(
      db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-02" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    // a different type for the same plant is fine
    await db.insert(careTask).values({ plantId: p.id, type: "rotate", dueOn: "2026-11-02" });
  });
});
