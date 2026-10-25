import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { discoverSearch, user } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/locales";
import { monthSpend, withBudget } from "@/lib/ai/budget";
import { callStructured, type StructuredOutput } from "@/lib/ai/client";
import { MOCK_USAGE } from "@/lib/ai/mock";
import { normalizeScientificName } from "@/lib/ai/schemas";
import { env } from "@/lib/env";
import { householdContext } from "@/lib/gardener/context";
import type { DiscoverCard, DiscoverInput } from "./types";

const MODEL = "claude-sonnet-5-5" as const;
const MAX_TOKENS = 16_000;
const MAX_CARDS = 5;

export const DISCOVER_SYSTEM_PROMPT = `You help three friends sharing an apartment pick their next houseplant, before they go shopping. Suggest about 6 real, widely sold species that fit what they ask for.

Rules:
- Only suggest plants whose light needs match the chosen spot (light level, window direction, distance from the window). Never suggest a plant that would struggle there.
- Respect the effort level: easy = very forgiving; medium = some attention; devoted = demanding plants are fine.
- Never claim plants purify the air (lab results that don't apply to homes). Real benefits you may mention: humidity, wellbeing, scent, fresh herbs.
- Always state pet and child safety honestly.
- For edible plants, explain how to harvest and what to expect; otherwise harvest is null.
- Say how each one goes with the plants they already have (style, or what it adds to the collection).
- Don't suggest species they already own.
- Write every text field in the user's language (given as "locale"), in plain text, short.`;

export const DiscoverResult = z.object({
  suggestions: z.array(
    z.object({
      scientificName: z.string(),
      commonName: z.string(),
      whyItFits: z.string(),
      ease: z.string(),
      goesWith: z.string(),
      benefits: z.string(),
      safety: z.string(),
      harvest: z.string().nullable(),
    }),
  ),
});

const Input = z.object({
  spotId: z.uuid().nullable(),
  newSpot: z
    .object({
      windowDirection: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "none"]),
      distance: z.enum(["close", "middle", "far"]),
    })
    .nullable(),
  effort: z.enum(["easy", "medium", "devoted"]),
  wants: z.array(z.enum(["looks", "home", "edible"])).max(3),
  style: z.string().max(200),
});

type DiscoverRequest = {
  locale: Locale;
  spot: { name?: string; lightLevel?: string; windowDirection: string; distance?: string } | null;
  effort: string;
  wants: string[];
  style: string;
  season: string;
  currentPlants: { name: string; species: string | null }[];
};
export type DiscoverDeps = { call?: (req: DiscoverRequest) => Promise<StructuredOutput> };

function callLive(req: DiscoverRequest): Promise<StructuredOutput> {
  return callStructured({
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: DISCOVER_SYSTEM_PROMPT,
    content: `Suggest plants for this request.\n${JSON.stringify(req)}`,
    schema: DiscoverResult,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
}

const card = (scientificName: string, commonName: string, harvest: string | null = null): DiscoverCard => ({
  scientificName,
  commonName,
  whyItFits: `[mock] ${commonName} likes this spot.`,
  ease: "Easy",
  goesWith: "Goes with your collection.",
  benefits: "Wellbeing.",
  safety: "Check before letting pets nibble.",
  harvest,
});

/** Offline stand-in: a fixed list (one more than shown, so filtering owned plants still leaves five). */
async function callMock(): Promise<StructuredOutput> {
  return {
    output: {
      suggestions: [
        card("Zamioculcas zamiifolia", "ZZ plant"),
        card("Calathea orbifolia", "Calathea orbifolia"),
        card("Ocimum basilicum", "Basil", "Pinch the tops weekly."),
        card("Peperomia obtusifolia", "Baby rubber plant"),
        card("Chlorophytum comosum", "Spider plant"),
        card("Epipremnum aureum", "Golden pothos"),
      ],
    },
    refused: false,
    usage: MOCK_USAGE,
  };
}

/** True once the month's AI spend has reached the cap: Discover is back next month. */
export async function discoverPaused(): Promise<boolean> {
  const { spentUsd, capUsd } = await monthSpend();
  return spentUsd >= capUsd;
}

async function localeOf(userId: string): Promise<Locale> {
  const [row] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  return row && isLocale(row.locale) ? row.locale : "en";
}

/**
 * Suggests plants for a spot. Owned species are filtered out; the result
 * replaces the user's last search. Nothing is stored when it fails.
 */
export async function runDiscover(
  userId: string,
  raw: DiscoverInput,
  deps: DiscoverDeps = {},
): Promise<{ status: "ok"; cards: DiscoverCard[] } | { status: "paused" } | { status: "error" }> {
  const valid = Input.safeParse(raw);
  if (!valid.success) return { status: "error" };
  const input = valid.data;
  if (await discoverPaused()) return { status: "paused" };

  const [locale, household] = await Promise.all([localeOf(userId), householdContext(userId)]);
  const chosen = input.spotId ? household.spots.find((s) => s.id === input.spotId) : undefined;
  if (input.spotId && !chosen) return { status: "error" }; // e.g. the spot was deleted while the page was open
  const req: DiscoverRequest = {
    locale,
    spot: chosen
      ? { name: chosen.name, lightLevel: chosen.lightLevel, windowDirection: chosen.windowDirection }
      : input.newSpot,
    effort: input.effort,
    wants: input.wants,
    style: input.style,
    season: household.home.season,
    currentPlants: household.plants.map((p) => ({ name: p.name, species: p.species })),
  };
  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : callLive);

  let cards: DiscoverCard[];
  try {
    const out = await withBudget("discover", userId, MODEL, async () => {
      const r = await call(req);
      return { result: r, usage: r.usage };
    });
    const parsed = out.refused ? null : DiscoverResult.safeParse(out.output);
    if (!parsed?.success) return { status: "error" };
    const owned = new Set(household.plants.flatMap((p) => (p.species ? [normalizeScientificName(p.species)] : [])));
    cards = parsed.data.suggestions
      .filter((c) => c.scientificName.trim() && !owned.has(normalizeScientificName(c.scientificName)))
      .slice(0, MAX_CARDS);
  } catch (error) {
    console.error("discover failed", error);
    return { status: "error" };
  }

  try {
    const stored = { input: input as Record<string, unknown>, results: cards as Record<string, unknown>[], locale };
    await db
      .insert(discoverSearch)
      .values({ userId, ...stored })
      .onConflictDoUpdate({ target: discoverSearch.userId, set: { ...stored, createdAt: new Date() } });
  } catch (error) {
    console.error("discover: could not store the search", error);
    return { status: "error" };
  }
  return { status: "ok", cards };
}

export async function lastSearch(
  userId: string,
): Promise<{ input: DiscoverInput; cards: DiscoverCard[]; locale: Locale; createdAt: Date } | null> {
  const [row] = await db.select().from(discoverSearch).where(eq(discoverSearch.userId, userId));
  if (!row) return null;
  return {
    input: row.input as unknown as DiscoverInput,
    cards: row.results as unknown as DiscoverCard[],
    locale: row.locale,
    createdAt: row.createdAt,
  };
}
