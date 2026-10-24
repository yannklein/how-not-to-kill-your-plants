import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { careTask, feedEvent, feedText, group, home, plant } from "@/db/schema";
import { runBirthdays, runFeedTextFill, runMoodChanges, runSeasonChanges } from "@/lib/feed/cron";
import { db, resetDb } from "./setup";

describe("feed cron", () => {
  let groupId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    [{ id: groupId }] = await db.insert(group).values({ name: "YA" }).returning({ id: group.id });
  });

  const addPlant = async (values: Partial<typeof plant.$inferInsert> = {}) =>
    (await db.insert(plant).values({ groupId, name: "Pilea", acquiredOn: "2026-10-01", ...values }).returning())[0];
  const events = (type: string) => db.select().from(feedEvent).where(eq(feedEvent.type, type));

  it("sets mood and season baselines on the first run without posting", async () => {
    const p = await addPlant();
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-01" });

    expect(await runMoodChanges("2026-11-10")).toBe(0);
    expect(await runSeasonChanges("2026-11-10")).toBe(0);
    expect(await db.select().from(feedEvent)).toHaveLength(0);

    const [after] = await db.select().from(plant).where(eq(plant.id, p.id));
    expect(after.lastMood).toBe("sulking");
    const [h] = await db.select().from(home);
    expect(h.lastSeason).toBe("autumn");
  });

  it("posts when a plant starts sulking, once", async () => {
    const p = await addPlant({ lastMood: "happy" });
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-06" });

    expect(await runMoodChanges("2026-11-10")).toBe(1);
    expect(await runMoodChanges("2026-11-10")).toBe(0);
    const [ev] = await events("mood");
    expect(ev.payload).toMatchObject({ from: "happy", to: "sulking" });
    const [after] = await db.select().from(plant).where(eq(plant.id, p.id));
    expect(after.lastMoodAt).toBeInstanceOf(Date);
  });

  it("does not post mood changes that don't involve sulking", async () => {
    const p = await addPlant({ lastMood: "happy" });
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-09" });
    expect(await runMoodChanges("2026-11-10")).toBe(0);
    const [after] = await db.select().from(plant).where(eq(plant.id, p.id));
    expect(after.lastMood).toBe("needy");
  });

  it("announces entering the dormant season once per alive plant", async () => {
    await db.update(home).set({ lastSeason: "summer" });
    await addPlant();
    await addPlant({ name: "Ficus" });
    await addPlant({ name: "Ghost", status: "dead" });

    expect(await runSeasonChanges("2026-09-25")).toBe(2);
    const [ev] = await events("season");
    expect(ev.payload).toMatchObject({ season: "autumn", growing: false });
    expect(await runSeasonChanges("2026-09-26")).toBe(0);
  });

  it("stays quiet when the season changes but growth doesn't (spring to summer)", async () => {
    await db.update(home).set({ lastSeason: "spring" });
    await addPlant();
    expect(await runSeasonChanges("2026-06-10")).toBe(0);
    expect((await db.select().from(home))[0].lastSeason).toBe("summer");
  });

  it("celebrates the one-month birthday once", async () => {
    await addPlant({ createdAt: new Date("2026-10-24T10:00:00Z") });
    expect(await runBirthdays("2026-11-24")).toBe(1);
    expect(await runBirthdays("2026-11-24")).toBe(0);
    expect(await runBirthdays("2026-11-25")).toBe(0);
    const [ev] = await events("birthday");
    expect(ev.payload).toMatchObject({ kind: "month", years: 0 });
  });

  it("fills missing post texts (mock mode)", async () => {
    const p = await addPlant();
    const [ev] = await db
      .insert(feedEvent)
      .values({ plantId: p.id, type: "first", payload: { type: "first", mood: "happy", userName: "Yann" } })
      .returning();
    await db
      .insert(feedEvent)
      .values({ plantId: p.id, type: "first", payload: { type: "first", mood: "happy", userName: "Yann" }, textAttempts: 2 });

    expect(await runFeedTextFill()).toBe(1);
    expect(await db.select().from(feedText).where(eq(feedText.eventId, ev.id))).toHaveLength(3);
    expect(await runFeedTextFill()).toBe(0);
  });

  it("ignores events older than two days", async () => {
    const p = await addPlant();
    await db.insert(feedEvent).values({
      plantId: p.id, type: "first", payload: { type: "first", mood: "happy", userName: "Yann" },
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    });
    expect(await runFeedTextFill()).toBe(0);
    expect(await db.select().from(feedText).where(and())).toHaveLength(0);
  });

  it("never writes the same post twice when two fills overlap", async () => {
    const p = await addPlant();
    const [ev] = await db
      .insert(feedEvent)
      .values({ plantId: p.id, type: "first", payload: { type: "first", mood: "happy", userName: "Yann" } })
      .returning();
    await Promise.all([runFeedTextFill(), runFeedTextFill()]);
    const [after] = await db.select().from(feedEvent).where(eq(feedEvent.id, ev.id));
    expect(after.textAttempts).toBe(1);
  });
});
