import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, home } from "@/db/schema";
import { BudgetExceededError, monthSpend, withBudget } from "@/lib/ai/budget";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const usage = { input_tokens: 0, output_tokens: 0 };
let month: string;

async function seed(cost: string) {
  await db.insert(aiUsage).values({
    feature: "chat",
    model: "claude-sonnet-5-5",
    costUsd: cost,
    month,
  });
}

beforeEach(async () => {
  await resetDb();
  const [h] = await db.insert(home).values({ aiMonthlyCapUsd: "1" }).returning();
  month = monthKeyIn(h.timezone);
});

describe("withBudget", () => {
  it("blocks optional features at the cap without calling", async () => {
    await seed("1.000000");
    const call = vi.fn(async () => ({ result: "x", usage }));
    await expect(withBudget("chat", null, "claude-haiku-5-5", call)).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it("lets essential features run at the cap and records usage", async () => {
    await seed("1.000000");
    const call = vi.fn(async () => ({
      result: "ok",
      usage: { input_tokens: 1000, output_tokens: 100 },
    }));
    await expect(withBudget("identify", null, "claude-sonnet-5-5", call)).resolves.toBe("ok");
    const rows = await db.select().from(aiUsage).where(eq(aiUsage.feature, "identify"));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.003, 6);
    expect(rows[0].month).toBe(month);
  });

  it("sets aiWarnedForMonth on first crossing of 80%", async () => {
    await seed("0.790000");
    await withBudget("identify", null, "claude-sonnet-5-5", async () => ({
      result: 1,
      usage: { input_tokens: 0, output_tokens: 2000 }, // $0.02
    }));
    const [h] = await db.select().from(home);
    expect(h.aiWarnedForMonth).toBe(month);
    expect((await monthSpend()).warn).toBe(true);
  });

  it("does not warn below 80%", async () => {
    await seed("0.100000");
    await withBudget("identify", null, "claude-sonnet-5-5", async () => ({ result: 1, usage }));
    const [h] = await db.select().from(home);
    expect(h.aiWarnedForMonth).toBeNull();
  });
});
