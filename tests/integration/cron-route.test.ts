import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/tick/route";
import { careTask, group, home, plant, species } from "@/db/schema";
import { getOrCreateSpecies } from "@/lib/ai/care-profile";
import { db, resetDb } from "./setup";

const tick = (auth?: string) =>
  POST(
    new Request("http://localhost/api/cron/tick", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(async () => {
  await resetDb();
  await db.insert(home).values({});
});

describe("POST /api/cron/tick", () => {
  it("rejects a missing or wrong bearer", async () => {
    expect((await tick()).status).toBe(401);
    expect((await tick("Bearer nope")).status).toBe(401);
    expect((await tick("test")).status).toBe(401);
  });

  it("finishes a pending care profile and backfills the missing initial tasks", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    const [g] = await db.insert(group).values({ name: "G" }).returning({ id: group.id });
    const [p] = await db
      .insert(plant)
      .values({ groupId: g.id, speciesId: sp.id, name: "Pip", acquiredOn: "2026-10-20", justBought: true })
      .returning({ id: plant.id });
    await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-10-27", state: { keep: 1 } });

    const res = await tick("Bearer test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profilesReady: 1, digestsSent: 0 });

    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row.careProfileStatus).toBe("ready");
    const tasks = await db.select().from(careTask).where(eq(careTask.plantId, p.id));
    expect(tasks.map((t) => t.type).sort()).toEqual(
      expect.arrayContaining(["water", "settle_check", "fertilize"]),
    );
    const [water] = tasks.filter((t) => t.type === "water");
    expect(water.dueOn).toBe("2026-10-27");
    expect(water.state).toEqual({ keep: 1 });
  });

  it("is idempotent", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    const [g] = await db.insert(group).values({ name: "G" }).returning({ id: group.id });
    const [p] = await db
      .insert(plant)
      .values({ groupId: g.id, speciesId: sp.id, name: "Pip", acquiredOn: "2026-10-20" })
      .returning({ id: plant.id });
    await tick("Bearer test");
    const before = await db.select().from(careTask).where(eq(careTask.plantId, p.id));
    expect(await (await tick("Bearer test")).json()).toEqual({ profilesReady: 0, digestsSent: 0 });
    const after = await db.select().from(careTask).where(and(eq(careTask.plantId, p.id)));
    expect(after).toHaveLength(before.length);
  });
});
