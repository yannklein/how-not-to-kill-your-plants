import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage, home } from "@/db/schema";
import { monthKeyIn } from "@/lib/time";
import { costUsd, type AiFeature, type AiModel, type Usage } from "./pricing";

export const ESSENTIAL: ReadonlySet<AiFeature> = new Set<AiFeature>(["identify", "care_profile"]);

const WARN_RATIO = 0.8;

export class BudgetExceededError extends Error {
  constructor(
    public readonly feature: AiFeature,
    public readonly spentUsd: number,
    public readonly capUsd: number,
  ) {
    super(`AI monthly budget exceeded (${spentUsd.toFixed(2)} of ${capUsd.toFixed(2)} USD)`);
    this.name = "BudgetExceededError";
  }
}

async function getHome() {
  const [row] = await db.select().from(home).limit(1);
  if (!row) throw new Error("No home row configured");
  return row;
}

async function spentIn(month: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(eq(aiUsage.month, month));
  return Number(row?.total ?? 0);
}

export async function monthSpend(): Promise<{ spentUsd: number; capUsd: number; warn: boolean }> {
  const h = await getHome();
  const spentUsd = await spentIn(monthKeyIn(h.timezone));
  const capUsd = Number(h.aiMonthlyCapUsd);
  return { spentUsd, capUsd, warn: spentUsd >= capUsd * WARN_RATIO };
}

/**
 * The only place AI usage is recorded. Optional features are blocked once the
 * month's spend reaches the cap; essential ones always run.
 */
export async function withBudget<T>(
  feature: AiFeature,
  userId: string | null,
  model: AiModel,
  call: () => Promise<{ result: T; usage: Usage }>,
): Promise<T> {
  const h = await getHome();
  const month = monthKeyIn(h.timezone);
  const capUsd = Number(h.aiMonthlyCapUsd);

  if (!ESSENTIAL.has(feature)) {
    const spent = await spentIn(month);
    if (spent >= capUsd) throw new BudgetExceededError(feature, spent, capUsd);
  }

  const { result, usage } = await call();
  const cost = costUsd(model, usage);
  await db.insert(aiUsage).values({
    feature,
    model,
    userId,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    costUsd: cost.toFixed(6),
    month,
  });

  const spent = await spentIn(month);
  if (spent >= capUsd * WARN_RATIO && h.aiWarnedForMonth !== month) {
    await db.update(home).set({ aiWarnedForMonth: month }).where(eq(home.id, h.id));
  }
  return result;
}
