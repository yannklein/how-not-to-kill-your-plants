import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, home, species, user } from "@/db/schema";
import { ensureCareProfile, getOrCreateSpecies } from "@/lib/ai/care-profile";
import { identifyPlant } from "@/lib/ai/identify";
import { CareProfile } from "@/lib/ai/schemas";
import { db, resetDb } from "./setup";

beforeEach(async () => {
  await resetDb();
  await db.insert(home).values({});
});

describe("getOrCreateSpecies", () => {
  it("upserts on the normalized name", async () => {
    const a = await getOrCreateSpecies("Ficus elastica 'Tineke'", "Rubber plant");
    const b = await getOrCreateSpecies("ficus  ELASTICA", "Rubber tree");
    expect(b.id).toBe(a.id);
    expect(a.scientificNameKey).toBe("ficus elastica");
  });
});

describe("ensureCareProfile (AI_MODE=mock)", () => {
  it("stores a parseable profile and records $0.01 usage", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    await expect(ensureCareProfile(sp.id)).resolves.toBe("ready");
    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row.careProfileStatus).toBe("ready");
    expect(CareProfile.safeParse(row.careProfile).success).toBe(true);
    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(Number(usage[0].costUsd)).toBeCloseTo(0.01, 6);
  });

  it("does not call the generator when already ready", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    await ensureCareProfile(sp.id);
    const generate = vi.fn();
    await expect(ensureCareProfile(sp.id, { generate })).resolves.toBe("ready");
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails after three failed attempts", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    const generate = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(ensureCareProfile(sp.id, { generate })).resolves.toBe("failed");
    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row.careProfileStatus).toBe("failed");
    expect(row.profileAttempts).toBe(3);
    expect(generate).toHaveBeenCalledTimes(3);
  });
});

describe("identifyPlant (AI_MODE=mock)", () => {
  it("returns the Pilea fixture and records usage", async () => {
    await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com" });
    const r = await identifyPlant({ images: [], locale: "en", userId: "u1" });
    expect(r.candidates[0]).toMatchObject({ scientificName: "Pilea peperomioides", confidence: 0.92 });
    const rows = await db.select().from(aiUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "identify", userId: "u1" });
  });
});
