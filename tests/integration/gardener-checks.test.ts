import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, careTask, gardenerAlert, group, home, photo, plant, taskCompletion, user } from "@/db/schema";
import type { StructuredOutput } from "@/lib/ai/client";
import { checkPhoto, runPatternChecks, runPhotoChecks } from "@/lib/gardener/checks";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const usage = { input_tokens: 10, output_tokens: 10 };

describe("gardener health checks (AI_MODE=mock)", () => {
  let groupId: string;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // failure paths log by design
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values({ id: "u-y", name: "Yann", email: "y@example.com" });
    [{ id: groupId }] = await db.insert(group).values({ name: "YA" }).returning({ id: group.id });
  });
  afterEach(() => vi.restoreAllMocks());

  async function plantWithPhoto(name: string, kind: "plant" | "label" = "plant") {
    const [p] = await db.insert(plant).values({ groupId, name, acquiredOn: "2026-10-01" }).returning();
    const [ph] = await db
      .insert(photo)
      .values({ plantId: p.id, userId: "u-y", objectKey: `photos/draft/${name}.jpg`, width: 1, height: 1, kind })
      .returning();
    return { plantId: p.id, photoId: ph.id };
  }
  const alerts = () => db.select().from(gardenerAlert);
  const checked = async (photoId: string) => (await db.select().from(photo).where(eq(photo.id, photoId)))[0].checkedAt;

  it("warns about a visible problem and marks the photo checked", async () => {
    const { photoId } = await plantWithPhoto("Sick fern");
    expect(await checkPhoto(photoId)).toBe("alert");
    const [a] = await alerts();
    expect(a).toMatchObject({ category: "light", source: "photo", status: "open", photoId });
    expect(await checked(photoId)).toBeInstanceOf(Date);
  });

  it("stays quiet for a healthy plant", async () => {
    const { photoId } = await plantWithPhoto("Fern");
    expect(await checkPhoto(photoId)).toBe("healthy");
    expect(await alerts()).toHaveLength(0);
    expect(await checked(photoId)).toBeInstanceOf(Date);
  });

  it("never warns or retries forever when the check fails, is refused or returns junk", async () => {
    const calls: ((...a: unknown[]) => Promise<StructuredOutput>)[] = [
      async () => {
        throw new Error("529 overloaded");
      },
      async () => ({ output: null, refused: true, usage }),
      async () => ({ output: { problem: "maybe" }, refused: false, usage }),
    ];
    for (const call of calls) {
      const { photoId } = await plantWithPhoto(`Sick ${Math.random()}`);
      expect(await checkPhoto(photoId, { call })).toBe("skipped");
      expect(await checked(photoId)).toBeInstanceOf(Date);
    }
    expect(await alerts()).toHaveLength(0);
  });

  it("skips the check without calling the model when the budget is spent", async () => {
    await db.update(home).set({ aiMonthlyCapUsd: "0" });
    await db.insert(aiUsage).values({
      feature: "identify", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: "0.01", month: monthKeyIn("Europe/Madrid"),
    });
    const { photoId } = await plantWithPhoto("Sick fern");
    const call = vi.fn();
    expect(await checkPhoto(photoId, { call })).toBe("skipped");
    expect(call).not.toHaveBeenCalled();
  });

  it("checks only unchecked plant photos", async () => {
    const done = await plantWithPhoto("Sick done");
    await db.update(photo).set({ checkedAt: new Date() }).where(eq(photo.id, done.photoId));
    await plantWithPhoto("Sick label", "label");
    const fresh = await plantWithPhoto("Sick fresh");

    expect(await runPhotoChecks()).toBe(1);
    expect((await alerts()).map((a) => a.plantId)).toEqual([fresh.plantId]);
  });

  it("looks at flagged plants weekly and only calls the model for them", async () => {
    const [p] = await db.insert(plant).values({ groupId, name: "Ficus", acquiredOn: "2026-10-01" }).returning();
    const [healthy] = await db.insert(plant).values({ groupId, name: "Pilea", acquiredOn: "2026-10-01" }).returning();
    const [task] = await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-25" }).returning();
    for (let i = 0; i < 3; i++)
      await db.insert(taskCompletion).values({
        taskId: task.id, plantId: p.id, type: "water", userId: "u-y", outcome: "still_moist",
        completedAt: new Date(Date.UTC(2026, 10, 15 + i)),
      });

    expect(await runPatternChecks("2026-11-20")).toBe(1);
    const [a] = await alerts();
    expect(a).toMatchObject({ plantId: p.id, source: "pattern", category: "overwatering" });
    expect(await runPatternChecks("2026-11-20")).toBe(0);

    const [h] = await db.select().from(plant).where(eq(plant.id, healthy.id));
    expect(h.lastPatternCheckOn).toBe("2026-11-20");
    const call = vi.fn();
    await db.update(plant).set({ lastPatternCheckOn: null }).where(eq(plant.id, healthy.id));
    await runPatternChecks("2026-11-20", { call });
    expect(call).not.toHaveBeenCalled();
  });
});
