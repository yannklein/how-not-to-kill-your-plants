import { and, eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, gardenerAlert, group, groupMember, home, plant, tip, tipRecipient, user } from "@/db/schema";
import { runSeasonChanges } from "@/lib/feed/cron";
import { deliverTips } from "@/lib/tips/deliver";
import { db, resetDb } from "./setup";

const day = 24 * 3600_000;
const now = new Date("2026-11-20T09:00:00Z");

describe("tip delivery", () => {
  const [Y, M] = ["u-y", "u-m"];

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
  });

  async function queue(kind: "season" | "repot" | "species" | "pattern", triggeredAt: Date, userId = Y) {
    const [t] = await db
      .insert(tip)
      .values({ kind, triggerKey: `${kind}:${triggeredAt.toISOString()}:${userId}`, params: {}, triggeredAt })
      .returning();
    await db.insert(tipRecipient).values({ tipId: t.id, userId });
    return t.id;
  }
  const shown = (userId = Y) =>
    db
      .select({ kind: tip.kind })
      .from(tipRecipient)
      .innerJoin(tip, eq(tip.id, tipRecipient.tipId))
      .where(and(eq(tipRecipient.userId, userId), isNotNull(tipRecipient.shownAt)));

  it("shows one tip per person per week, the most important first, then the next one", async () => {
    await queue("repot", new Date(now.getTime() - day));
    await queue("season", new Date(now.getTime() - day));

    expect(await deliverTips(now)).toBe(1);
    expect((await shown()).map((r) => r.kind)).toEqual(["season"]);
    expect(await deliverTips(new Date(now.getTime() + 3600_000))).toBe(0);

    expect(await deliverTips(new Date(now.getTime() + 7 * day))).toBe(1);
    expect((await shown()).map((r) => r.kind).sort()).toEqual(["repot", "season"]);
  });

  it("lets tips expire two weeks after their trigger", async () => {
    await queue("pattern", new Date(now.getTime() - 15 * day));
    expect(await deliverTips(now)).toBe(0);
    expect(await shown()).toHaveLength(0);
  });

  it("caps each person separately", async () => {
    await queue("season", now, Y);
    await queue("season", now, M);
    expect(await deliverTips(now)).toBe(2);
  });

  it("queues one season tip for everyone when the growing season ends, none on the first run", async () => {
    expect(await runSeasonChanges("2026-09-25")).toBe(0); // baseline
    expect(await db.select().from(tip)).toHaveLength(0);

    await db.update(home).set({ lastSeason: "summer" });
    await runSeasonChanges("2026-09-25");
    const tips = await db.select().from(tip);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ kind: "season", triggerKey: "season:2026-autumn" });
    expect(await db.select().from(tipRecipient)).toHaveLength(2);
  });

  describe("re-checks a tip when it's about to be shown", () => {
    let plantId: string;

    beforeEach(async () => {
      const [g] = await db.insert(group).values({ name: "YA" }).returning({ id: group.id });
      await db.insert(groupMember).values({ groupId: g.id, userId: Y });
      [{ id: plantId }] = await db.insert(plant).values({ groupId: g.id, name: "Pilea", acquiredOn: "2026-10-01" }).returning({ id: plant.id });
    });

    async function queueAbout(kind: "repot" | "pattern", triggerKey: string, category: "repot" | "overwatering") {
      const [t] = await db.insert(tip).values({ kind, plantId, category, triggerKey, params: { plant: "Pilea" }, triggeredAt: now }).returning();
      await db.insert(tipRecipient).values({ tipId: t.id, userId: Y });
    }

    it("skips a tip about a plant that died, keeping the week's slot for a valid one", async () => {
      // A repot tip outranks a species tip, so only the plant's death can keep it out.
      const [task] = await db.insert(careTask).values({ plantId, type: "repot", dueOn: "2026-11-23" }).returning();
      await queueAbout("repot", `repot:${task.id}:2026-11-23`, "repot");
      await db.update(plant).set({ status: "dead" }).where(eq(plant.id, plantId));
      await queue("species", new Date(now.getTime() - day));
      expect(await deliverTips(now)).toBe(1);
      expect((await shown()).map((r) => r.kind)).toEqual(["species"]);
    });

    it("never shows a tip next to a gardener warning about the same thing", async () => {
      await queueAbout("pattern", "moist:y", "overwatering");
      await db.insert(gardenerAlert).values({ plantId, source: "pattern", category: "overwatering", texts: { en: "a", fr: "b", "pt-BR": "c" } });
      expect(await deliverTips(now)).toBe(0);
    });

    it("drops a repot tip once that repot is done or moved", async () => {
      const [task] = await db.insert(careTask).values({ plantId, type: "repot", dueOn: "2026-11-23" }).returning();
      await queueAbout("repot", `repot:${task.id}:2026-11-23`, "repot");
      await db.update(careTask).set({ dueOn: "2028-03-15" }).where(eq(careTask.id, task.id));
      expect(await deliverTips(now)).toBe(0);
    });
  });
});
