import { and, eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { home, tip, tipRecipient, user } from "@/db/schema";
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
});
