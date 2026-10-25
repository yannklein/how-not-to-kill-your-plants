import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, group, groupMember, home, plant, species, spot, user } from "@/db/schema";
import { normalizeScientificName } from "@/lib/ai/schemas";
import { discoverPaused, lastSearch, runDiscover } from "@/lib/discover/search";
import type { DiscoverInput } from "@/lib/discover/types";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

describe("Discover (AI_MODE=mock)", () => {
  const [Y, M] = ["u-y", "u-m"];
  let ya: string, livingRoom: string;
  const input = (): DiscoverInput => ({ spotId: livingRoom, newSpot: null, effort: "easy", wants: ["looks"], style: "" });

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [g1, g2] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    ya = g1.id;
    await db.insert(groupMember).values([
      { groupId: g1.id, userId: Y },
      { groupId: g2.id, userId: M },
    ]);
    [{ id: livingRoom }] = await db
      .insert(spot)
      .values({ name: "Living room window", lightLevel: "bright_indirect", windowDirection: "S" })
      .returning({ id: spot.id });
  });

  it("suggests five plants and keeps the search", async () => {
    const result = await runDiscover(Y, input());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.cards).toHaveLength(5);
    expect((await lastSearch(Y))?.cards).toEqual(result.cards);
    expect(await lastSearch(M)).toBeNull();
  });

  it("never suggests a plant the user already has, cultivar names included", async () => {
    const [sp] = await db
      .insert(species)
      .values({ scientificNameKey: "zamioculcas zamiifolia", scientificName: "Zamioculcas zamiifolia 'Raven'" })
      .returning();
    await db.insert(plant).values({ groupId: ya, speciesId: sp.id, name: "Zed", acquiredOn: "2026-10-01" });
    const result = await runDiscover(Y, input());
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.cards.map((c) => normalizeScientificName(c.scientificName))).not.toContain("zamioculcas zamiifolia");
  });

  it("pauses new searches at the budget cap but keeps the last one", async () => {
    await runDiscover(Y, input());
    await db.update(home).set({ aiMonthlyCapUsd: "0" });
    await db.insert(aiUsage).values({
      feature: "identify", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: "0.01", month: monthKeyIn("Europe/Madrid"),
    });
    expect(await discoverPaused()).toBe(true);
    const call = vi.fn();
    expect(await runDiscover(Y, input(), { call })).toEqual({ status: "paused" });
    expect(call).not.toHaveBeenCalled();
    expect((await lastSearch(Y))?.cards).toHaveLength(5);
  });

  it("keeps the previous search when the model fails", async () => {
    await runDiscover(Y, input());
    const failing = async () => {
      throw new Error("529");
    };
    expect(await runDiscover(Y, { ...input(), effort: "devoted" }, { call: failing })).toEqual({ status: "error" });
    expect((await lastSearch(Y))?.input.effort).toBe("easy");
  });
});
