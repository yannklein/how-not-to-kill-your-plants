import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, home, species, user } from "@/db/schema";
import {
  ensureCareProfile,
  getOrCreateSpecies,
  retryCareProfile,
} from "@/lib/ai/care-profile";
import { identifyPlant } from "@/lib/ai/identify";
import { MOCK_USAGE, mockProfile } from "@/lib/ai/mock";
import { CareProfile } from "@/lib/ai/schemas";
import { db, resetDb } from "./setup";

beforeEach(async () => {
  await resetDb();
  await db.insert(home).values({});
});

describe("getOrCreateSpecies", () => {
  it("upserts on the normalized name", async () => {
    const a = await getOrCreateSpecies(
      "Ficus elastica 'Tineke'",
      "Rubber plant",
    );
    const b = await getOrCreateSpecies("ficus  ELASTICA", "Rubber tree");
    expect(b.id).toBe(a.id);
    expect(a.scientificNameKey).toBe("ficus elastica");
  });
});

describe("ensureCareProfile (AI_MODE=mock)", () => {
  it("stores a parseable profile and records $0.01 usage", async () => {
    const sp = await getOrCreateSpecies(
      "Pilea peperomioides",
      "Chinese money plant",
    );
    await expect(ensureCareProfile(sp.id)).resolves.toBe("ready");
    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row.careProfileStatus).toBe("ready");
    expect(CareProfile.safeParse(row.careProfile).success).toBe(true);
    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(Number(usage[0].costUsd)).toBeCloseTo(0.01, 6);
  });

  it("does not call the generator when already ready", async () => {
    const sp = await getOrCreateSpecies(
      "Pilea peperomioides",
      "Chinese money plant",
    );
    await ensureCareProfile(sp.id);
    const generate = vi.fn();
    await expect(ensureCareProfile(sp.id, { generate })).resolves.toBe("ready");
    expect(generate).not.toHaveBeenCalled();
  });

  it("shares one generation between concurrent calls for the same species", async () => {
    const sp = await getOrCreateSpecies("Pilea peperomioides", "Chinese money plant");
    const generate = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { output: mockProfile, refused: false, usage: MOCK_USAGE };
    });
    const results = await Promise.all([
      ensureCareProfile(sp.id, { generate }),
      ensureCareProfile(sp.id, { generate }),
    ]);
    expect(results).toEqual(["ready", "ready"]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("makes one attempt per call: pending after one failure, failed after three", async () => {
    const sp = await getOrCreateSpecies(
      "Pilea peperomioides",
      "Chinese money plant",
    );
    const generate = vi.fn().mockRejectedValue(new Error("boom"));
    const get = async () =>
      (await db.select().from(species).where(eq(species.id, sp.id)))[0];
    expect(await ensureCareProfile(sp.id, { generate })).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await get()).toMatchObject({
      careProfileStatus: "pending",
      profileAttempts: 1,
    });
    await ensureCareProfile(sp.id, { generate });
    await ensureCareProfile(sp.id, { generate });
    expect(await get()).toMatchObject({
      careProfileStatus: "failed",
      profileAttempts: 3,
    });
    expect(await ensureCareProfile(sp.id, { generate })).toBe("failed");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("records usage and counts a failure when the output is invalid", async () => {
    const sp = await getOrCreateSpecies(
      "Pilea peperomioides",
      "Chinese money plant",
    );
    const generate = vi.fn().mockResolvedValue({
      output: { nope: true },
      refused: false,
      usage: { input_tokens: 100, output_tokens: 100 },
    });
    expect(await ensureCareProfile(sp.id, { generate })).toBe("failed");
    expect(await db.select().from(aiUsage)).toHaveLength(1);
    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row).toMatchObject({
      careProfileStatus: "pending",
      profileAttempts: 1,
    });
  });
});

describe("retryCareProfile", () => {
  it("resets a failed species and regenerates it", async () => {
    const sp = await getOrCreateSpecies(
      "Pilea peperomioides",
      "Chinese money plant",
    );
    await db
      .update(species)
      .set({ careProfileStatus: "failed", profileAttempts: 3 });
    await expect(retryCareProfile(sp.id)).resolves.toBe("ready");
    const [row] = await db.select().from(species).where(eq(species.id, sp.id));
    expect(row).toMatchObject({
      careProfileStatus: "ready",
      profileAttempts: 0,
    });
  });
});

describe("identifyPlant (AI_MODE=mock)", () => {
  it("returns the Pilea fixture and records usage", async () => {
    await db
      .insert(user)
      .values({ id: "u1", name: "U", email: "u@example.com" });
    const r = await identifyPlant({ images: [], locale: "en", userId: "u1" });
    expect(r.candidates[0]).toMatchObject({
      scientificName: "Pilea peperomioides",
      confidence: 0.92,
    });
    const rows = await db.select().from(aiUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "identify", userId: "u1" });
  });

  const usage = { input_tokens: 10, output_tokens: 10 };
  const input = { images: [], locale: "en" as const, userId: "u1" };
  const cases: [string, () => Promise<never> | Promise<unknown>, string][] = [
    [
      "pre-output refusal",
      async () => ({ output: null, refused: true, usage }),
      "refused",
    ],
    [
      "mid-stream refusal",
      async () => ({ output: null, refused: true, usage }),
      "refused",
    ],
    [
      "parse failure",
      async () => ({ output: { garbage: 1 }, refused: false, usage }),
      "error",
    ],
    [
      "cut-off output",
      async () => ({ output: null, refused: false, usage }),
      "error",
    ],
    [
      "API error",
      async () => {
        throw new Error("network");
      },
      "error",
    ],
  ];
  it.each(cases)(
    "returns the fallback without throwing on %s",
    async (_n, call, failure) => {
      await db
        .insert(user)
        .values({ id: "u1", name: "U", email: "u@example.com" });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await identifyPlant(input, { call: call as never });
      expect(r).toMatchObject({ isPlant: false, candidates: [], failure });
      spy.mockRestore();
    },
  );

  it("records usage for a billed refusal", async () => {
    await db
      .insert(user)
      .values({ id: "u1", name: "U", email: "u@example.com" });
    await identifyPlant(input, {
      call: async () => ({ output: null, refused: true, usage }),
    });
    expect(await db.select().from(aiUsage)).toHaveLength(1);
  });
});
