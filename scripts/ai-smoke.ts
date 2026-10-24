import { readFile } from "node:fs/promises";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage, species, user } from "@/db/schema";
import { ensureCareProfile, getOrCreateSpecies } from "@/lib/ai/care-profile";
import { identifyPlant } from "@/lib/ai/identify";
import { env } from "@/lib/env";

/**
 * Live AI smoke test: identify one photo, generate one care profile for the
 * top candidate into the DB, and print what happened plus the ai_usage rows.
 * Usage: AI_MODE=live node dist/ai-smoke.js [path-or-url-to-jpeg]
 * (dev: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ai-smoke.ts)
 */
async function loadImage(source: string): Promise<Buffer> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Could not fetch ${source}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(source);
}

async function main() {
  if (env.AI_MODE !== "live") throw new Error("Set AI_MODE=live (and ANTHROPIC_API_KEY) to run the smoke test");

  const source = process.argv[2] ?? "e2e/fixtures/pilea.jpg";
  const bytes = await loadImage(source);

  const [admin] = await db.select({ id: user.id }).from(user).orderBy(asc(user.createdAt)).limit(1);
  if (!admin) throw new Error("No user exists yet: run create-admin first");

  console.log(`Identifying ${source} (${bytes.length} bytes)...`);
  const result = await identifyPlant({
    images: [{ base64: bytes.toString("base64"), mediaType: "image/jpeg" }],
    locale: "en",
    userId: admin.id,
  });
  console.log("isPlant:", result.isPlant, "failure:", result.failure ?? "none");
  console.log("candidates:", JSON.stringify(result.candidates, null, 2));
  console.log("suggestedNames:", result.suggestedNames.join(", "));

  const top = result.candidates[0];
  if (!top) throw new Error("No candidate to generate a care profile for");

  const sp = await getOrCreateSpecies(top.scientificName, top.commonName);
  console.log(`Generating care profile for ${sp.scientificName}...`);
  const status = await ensureCareProfile(sp.id);
  const [row] = await db.select().from(species).where(eq(species.id, sp.id));
  console.log(`profile: ${status} (status=${row.careProfileStatus}, attempts=${row.profileAttempts})`);

  const usage = await db.select().from(aiUsage).orderBy(asc(aiUsage.createdAt));
  console.table(
    usage.map((u) => ({
      feature: u.feature,
      model: u.model,
      in: u.inputTokens,
      out: u.outputTokens,
      cacheRead: u.cacheReadTokens,
      cacheWrite: u.cacheWriteTokens,
      costUsd: u.costUsd,
      month: u.month,
    })),
  );
  const total = usage.reduce((sum, u) => sum + Number(u.costUsd), 0);
  console.log(`total ai_usage cost: $${total.toFixed(4)}`);
  if (status !== "ready" || result.failure) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
