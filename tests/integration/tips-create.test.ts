import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiUsage, careTask, gardenerAlert, group, groupMember, home, plant, species, taskCompletion, tip, tipRecipient, user,
} from "@/db/schema";
import { createTip, renderTipText } from "@/lib/tips/create";
import { findTipCandidates } from "@/lib/tips/triggers";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const today = "2026-11-20";

describe("tip triggers and creation (AI_MODE=mock)", () => {
  const [Y, A, M] = ["u-y", "u-a", "u-m"];
  let ya: string;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: A, name: "Adriana", email: "a@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [g1, g2] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    ya = g1.id;
    await db.insert(groupMember).values([
      { groupId: g1.id, userId: Y },
      { groupId: g1.id, userId: A },
      { groupId: g2.id, userId: M },
    ]);
  });

  const addPlant = async (values: Partial<typeof plant.$inferInsert> = {}) =>
    (await db.insert(plant).values({ groupId: ya, name: "Pilea", acquiredOn: "2026-10-01", ...values }).returning())[0];
  const kinds = async () => (await findTipCandidates(today)).map((c) => c.kind);

  it("tips the group about a repot coming up, once", async () => {
    const p = await addPlant({ createdAt: new Date("2026-09-01T10:00:00Z") });
    await db.insert(careTask).values({ plantId: p.id, type: "repot", dueOn: "2026-11-23" });

    const [c] = await findTipCandidates(today);
    expect(c).toMatchObject({ kind: "repot", plantId: p.id, category: "repot" });
    expect(c.recipients.sort()).toEqual([A, Y]);
    expect(await createTip(c)).not.toBeNull();
    expect(await createTip(c)).toBeNull();
    expect(await db.select().from(tip)).toHaveLength(1);
    expect(await db.select().from(tipRecipient)).toHaveLength(2);
  });

  it("tips about a species new to the household, not one already owned", async () => {
    const [sp] = await db.insert(species).values({ scientificNameKey: "monstera deliciosa", scientificName: "Monstera deliciosa" }).returning();
    await addPlant({ speciesId: sp.id, name: "Monty", createdAt: new Date("2026-11-19T10:00:00Z") });
    expect(await kinds()).toEqual(["species"]);

    await addPlant({ speciesId: sp.id, name: "Old Monty", status: "dead", createdAt: new Date("2026-01-01T10:00:00Z") });
    expect(await kinds()).toEqual([]);
  });

  it("hints at drainage after two moist answers, unless the gardener already warned", async () => {
    const p = await addPlant({ createdAt: new Date("2026-09-01T10:00:00Z") });
    const [task] = await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-25" }).returning();
    for (let i = 0; i < 2; i++)
      await db.insert(taskCompletion).values({
        taskId: task.id, plantId: p.id, type: "water", userId: Y, outcome: "still_moist",
        completedAt: new Date(Date.UTC(2026, 10, 17 + i)),
      });
    const [c] = await findTipCandidates(today);
    expect(c).toMatchObject({ kind: "pattern", category: "overwatering", plantId: p.id });

    await db.insert(gardenerAlert).values({
      plantId: p.id, source: "pattern", category: "overwatering", texts: { en: "a", fr: "b", "pt-BR": "c" },
    });
    expect(await kinds()).toEqual([]);
  });

  it("falls back to the template in the reader's language when the budget is spent", async () => {
    await db.update(home).set({ aiMonthlyCapUsd: "0" });
    await db.insert(aiUsage).values({
      feature: "identify", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: "0.01", month: monthKeyIn("Europe/Madrid"),
    });
    const id = (await createTip({
      kind: "repot", plantId: null, category: "repot", triggerKey: "repot:x", params: { plant: "Pilea", dueOn: "2026-11-23" }, recipients: [Y],
    }))!;
    const [t] = await db.select().from(tip).where(eq(tip.id, id));
    expect(t.texts).toBeNull();
    const fr = renderTipText(t, "fr");
    expect(fr).toContain("Pilea");
    expect(fr).not.toBe(renderTipText(t, "en"));
  });

  it("writes the tip in all three languages when it can (mock)", async () => {
    const id = (await createTip({
      kind: "pattern", plantId: null, category: "overwatering", triggerKey: "moist:x", params: { plant: "Pilea" }, recipients: [Y],
    }))!;
    const [t] = await db.select().from(tip).where(eq(tip.id, id));
    expect(t.texts).toMatchObject({ en: expect.stringContaining("[mock en]"), "pt-BR": expect.any(String) });
    expect(renderTipText(t, "fr")).toContain("[mock fr]");
  });

  it("tells the gardener what actually happened, with the species", async () => {
    const [sp] = await db.insert(species).values({ scientificNameKey: "pilea peperomioides", scientificName: "Pilea peperomioides" }).returning();
    const p = await addPlant({ speciesId: sp.id, name: "Pilo", createdAt: new Date("2026-09-01T10:00:00Z") });
    const [task] = await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-25" }).returning();
    for (let i = 0; i < 2; i++)
      await db.insert(taskCompletion).values({
        taskId: task.id, plantId: p.id, type: "water", userId: Y, outcome: "still_moist",
        completedAt: new Date(Date.UTC(2026, 10, 17 + i)),
      });
    const [c] = await findTipCandidates(today);
    expect(String(c.params.situation)).toMatch(/still moist at the last two/);
    expect(String(c.params.situation)).toContain("Pilea peperomioides");

    let seen: typeof c | undefined;
    await createTip(c, {
      call: async (input) => {
        seen = input;
        return { output: { en: "💡 a", fr: "💡 b", "pt-BR": "💡 c" }, refused: false, usage: { input_tokens: 1, output_tokens: 1 } };
      },
    });
    expect(seen?.params.situation).toBe(c.params.situation);
  });

  it("hints once per pair of moist answers, and only while they're recent", async () => {
    const p = await addPlant({ createdAt: new Date("2026-09-01T10:00:00Z") });
    const [task] = await db.insert(careTask).values({ plantId: p.id, type: "water", dueOn: "2026-11-25" }).returning();
    for (let i = 0; i < 2; i++)
      await db.insert(taskCompletion).values({
        taskId: task.id, plantId: p.id, type: "water", userId: Y, outcome: "still_moist",
        completedAt: new Date(Date.UTC(2026, 10, 15 + i)), // Sun 15 and Mon 16 Nov
      });
    const thisWeek = (await findTipCandidates("2026-11-20"))[0];
    const nextWeek = (await findTipCandidates("2026-11-23"))[0];
    expect(nextWeek.triggerKey).toBe(thisWeek.triggerKey);
    expect(await findTipCandidates("2026-11-25")).toEqual([]);
  });
});
