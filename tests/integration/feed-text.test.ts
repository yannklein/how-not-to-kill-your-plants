import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, feedEvent, feedText, group, home, plant } from "@/db/schema";
import type { StructuredOutput } from "@/lib/ai/client";
import { generateFeedTexts } from "@/lib/feed/text";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const usage = { input_tokens: 100, output_tokens: 100 };
const reply = (output: unknown): StructuredOutput => ({ output, refused: false, usage });
const texts = { en: "Hello 🌿", fr: "Bonjour 🌿", "pt-BR": "Olá 🌿", persona: null };

describe("generateFeedTexts", () => {
  let plantId: string;
  let eventId: string;

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // failure paths log by design
    await resetDb();
    await db.insert(home).values({});
    const [g] = await db.insert(group).values({ name: "YA" }).returning();
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: g.id, name: "Pilea", acquiredOn: "2026-10-01", persona: { summary: "Sunny", traits: ["bright"] } })
      .returning({ id: plant.id });
    [{ id: eventId }] = await db
      .insert(feedEvent)
      .values({ plantId, type: "first", payload: { type: "first", mood: "happy", userName: "Yann" } })
      .returning({ id: feedEvent.id });
  });

  afterEach(() => vi.restoreAllMocks());

  const stored = () => db.select().from(feedText).where(eq(feedText.eventId, eventId));
  const attempts = async () => (await db.select().from(feedEvent).where(eq(feedEvent.id, eventId)))[0].textAttempts;

  it("stores one text per language in mock mode, and doesn't call again", async () => {
    expect(await generateFeedTexts(eventId)).toBe("stored");
    expect((await stored()).map((r) => r.locale).sort()).toEqual(["en", "fr", "pt-BR"]);
    const call = vi.fn();
    expect(await generateFeedTexts(eventId, { call })).toBe("template");
    expect(call).not.toHaveBeenCalled();
  });

  it("uses the template when the monthly budget is spent", async () => {
    await db.update(home).set({ aiMonthlyCapUsd: "0" });
    await db.insert(aiUsage).values({
      feature: "identify", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: "0.01", month: monthKeyIn("Europe/Madrid"),
    });
    const call = vi.fn();
    expect(await generateFeedTexts(eventId, { call })).toBe("template");
    expect(call).not.toHaveBeenCalled();
    expect(await stored()).toHaveLength(0);
    expect(await attempts()).toBe(1);
  });

  it("stores nothing when a text comes back empty, and gives up after two attempts", async () => {
    const call = vi.fn(async () => reply({ ...texts, fr: "  " }));
    expect(await generateFeedTexts(eventId, { call })).toBe("template");
    expect(await generateFeedTexts(eventId, { call })).toBe("template");
    expect(await generateFeedTexts(eventId, { call })).toBe("template");
    expect(call).toHaveBeenCalledTimes(2);
    expect(await stored()).toHaveLength(0);
  });

  it("survives a refusal and a thrown API error", async () => {
    expect(await generateFeedTexts(eventId, { call: async () => ({ output: null, refused: true, usage }) })).toBe("template");
    expect(await generateFeedTexts(eventId, { call: async () => { throw new Error("529 overloaded"); } })).toBe("template");
    expect(await stored()).toHaveLength(0);
  });

  it("caps long texts and fills a missing personality", async () => {
    await db.update(plant).set({ persona: null }).where(eq(plant.id, plantId));
    const persona = { summary: "A dramatic diva", traits: ["proud", "thirsty", "loud"] };
    await generateFeedTexts(eventId, { call: async () => reply({ ...texts, en: "x".repeat(400), persona }) });
    const en = (await stored()).find((r) => r.locale === "en")!;
    expect(en.text.length).toBeLessThanOrEqual(280);
    const [p] = await db.select().from(plant).where(eq(plant.id, plantId));
    expect(p.persona).toEqual(persona);
  });
});
