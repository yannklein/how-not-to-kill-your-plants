import { beforeEach, describe, expect, it } from "vitest";
import { group, groupMember, plant, user } from "@/db/schema";
import { PlantInputError, updatePlant } from "@/lib/plants/update";
import { db, resetDb } from "./setup";

describe("updatePlant", () => {
  let ya: string;
  let other: string;
  let mine: string;
  let base: Record<string, unknown>;

  beforeEach(async () => {
    await resetDb();
    await db.insert(user).values({ id: "u-y", name: "Y", email: "y@example.com" });
    const [g1, g2] = await db.insert(group).values([{ name: "YA" }, { name: "Other" }]).returning({ id: group.id });
    ya = g1.id;
    other = g2.id;
    await db.insert(groupMember).values({ groupId: ya, userId: "u-y" });
    const [p] = await db
      .insert(plant)
      .values({ groupId: ya, name: "old", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
    mine = p.id;
    base = {
      name: "  New name ",
      groupId: ya,
      spotId: null,
      status: "alive",
      waterIntervalOverrideDays: 12,
      potSizeCm: null,
    };
  });

  it("applies valid edits", async () => {
    const updated = await updatePlant("u-y", mine, { ...base, status: "given_away" });
    expect(updated).toMatchObject({ name: "New name", waterIntervalOverrideDays: 12, status: "given_away" });
  });

  it("rejects a group the user is not in", async () => {
    await expect(updatePlant("u-y", mine, { ...base, groupId: other })).rejects.toBeInstanceOf(PlantInputError);
  });

  it("rejects non-positive overrides and empty names", async () => {
    await expect(updatePlant("u-y", mine, { ...base, waterIntervalOverrideDays: 0 })).rejects.toBeInstanceOf(PlantInputError);
    await expect(updatePlant("u-y", mine, { ...base, name: "  " })).rejects.toBeInstanceOf(PlantInputError);
  });

  it("is not found for non-members", async () => {
    await expect(updatePlant("nobody", mine, base)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("saves an edited personality and rejects one that is too long", async () => {
    const persona = { summary: "Dramatic diva", traits: ["proud", "thirsty"] };
    const updated = await updatePlant("u-y", mine, { ...base, persona });
    expect(updated.persona).toEqual(persona);
    await expect(
      updatePlant("u-y", mine, { ...base, persona: { summary: "x".repeat(301), traits: [] } }),
    ).rejects.toBeInstanceOf(PlantInputError);
    await expect(
      updatePlant("u-y", mine, { ...base, persona: { summary: "ok", traits: ["a", "b", "c", "d", "e", "f"] } }),
    ).rejects.toBeInstanceOf(PlantInputError);
  });
});
