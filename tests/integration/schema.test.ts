import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "./setup";
import { careTask, feedEvent, gardenerAlert, group, home, photo, plant, species, tip, tipRecipient, user } from "@/db/schema";

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

  it("defaults photo.kind to plant and feed_event.textAttempts to 0", async () => {
    const p = await seedPlant();
    await db.insert(user).values({ id: "u1", name: "Yann", email: "y@example.com" });
    const [ph] = await db
      .insert(photo)
      .values({ plantId: p.id, userId: "u1", objectKey: "photos/x.jpg", width: 1, height: 1 })
      .returning();
    expect(ph.kind).toBe("plant");
    const [ev] = await db.insert(feedEvent).values({ plantId: p.id, type: "first" }).returning();
    expect(ev.textAttempts).toBe(0);
  });

  it("opens new gardener alerts and leaves new photos unchecked", async () => {
    const p = await seedPlant();
    const [alert] = await db
      .insert(gardenerAlert)
      .values({ plantId: p.id, source: "photo", category: "light", texts: { en: "a", fr: "b", "pt-BR": "c" } })
      .returning();
    expect(alert.status).toBe("open");
    await db.insert(user).values({ id: "u2", name: "Ana", email: "a@example.com" });
    const [ph] = await db
      .insert(photo)
      .values({ plantId: p.id, userId: "u2", objectKey: "photos/y.jpg", width: 1, height: 1 })
      .returning();
    expect(ph.checkedAt).toBeNull();
  });

  it("keeps each tip unique by its trigger and queues it for recipients", async () => {
    await db.insert(user).values({ id: "u3", name: "Marcela", email: "m@example.com" });
    const [t] = await db.insert(tip).values({ kind: "season", triggerKey: "season:2027-spring", params: {} }).returning();
    await expect(
      db.insert(tip).values({ kind: "season", triggerKey: "season:2027-spring", params: {} }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    const [r] = await db.insert(tipRecipient).values({ tipId: t.id, userId: "u3" }).returning();
    expect(r.shownAt).toBeNull();
  });
});
