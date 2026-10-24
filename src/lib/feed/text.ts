import { eq, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { db } from "@/db/client";
import { feedEvent, feedText, plant, species, type Persona } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { withBudget } from "@/lib/ai/budget";
import { callStructured, type StructuredOutput } from "@/lib/ai/client";
import { MOCK_USAGE } from "@/lib/ai/mock";
import { env } from "@/lib/env";
import type { PostPayload, PostType } from "./types";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import ptBR from "../../../messages/pt-BR.json";

const MODEL = "claude-haiku-5-5" as const;
// Haiku 5.5 thinks adaptively by default and thinking shares max_tokens with the answer.
const MAX_TOKENS = 4_000;
const MAX_ATTEMPTS = 2;
const MAX_CHARS = 280;
const MESSAGES = { en, fr, "pt-BR": ptBR } as const;

export const FEED_TEXT_SYSTEM_PROMPT = `You write short news posts for a household plant-care app used by three friends who share an apartment. Each post is written by a houseplant, in the first person, in its own personality.

Tone: affectionate and a little cheeky. One to three short sentences. One or two emoji are welcome. Let the plant's personality show (a dramatic diva is dramatic, an easygoing plant is relaxed). Credit people by first name when the event involves someone.

Rules:
- Write the same post three times: English (en), French (fr) and Brazilian Portuguese (pt-BR). Natural, idiomatic, not literal translations.
- Never give care instructions that contradict good care for the species. If you mention any product, only organic or non-chemical ones.
- Don't invent facts beyond the event (no made-up measurements or dates).
- If the plant has no personality yet, invent one that fits its species and return it in "persona" (a one-sentence summary and three one-word traits, in the language given as the persona language). Otherwise return persona: null.

Examples of the voice (English):
- A dramatic Strelitzia logs a new leaf: "A new leaf. Unfurling slowly, as all great art does. You may applaud. 🌿✨"
- An easygoing Pachira was watered by Marcela: "Thanks for the drink, Marcela 💧 Feeling good, no notes."
- A Pilea is one month old: "One month in this apartment! I've grown 2 new leaves and zero complaints. Well, one complaint. The radiator."
- A sulking Ficus elastica is overdue for water: "I'm not saying I'm thirsty. I'm just saying the soil has become a desert and nobody has asked how I am. 🏜️"
- A Monstera as winter starts: "Going into winter mode 😴 Water me less, don't move me, and wake me up in March."
- A braided Ficus asks for its monthly photo: "It's been a month since my last portrait. I've been working on my look. Come see. 📸"
- An Asparagus fern got a new photo from Adriana: "Glow-up check: +4 cm since September. Adriana caught my good side."`;

export const FeedTexts = z.object({
  en: z.string(),
  fr: z.string(),
  "pt-BR": z.string(),
  persona: z.object({ summary: z.string(), traits: z.array(z.string()) }).nullable(),
});

export type FeedTextInput = {
  plantName: string;
  species: string | null;
  persona: Persona | null;
  event: { type: PostType; payload: PostPayload; createdAt: string };
};

export type FeedTextDeps = {
  /** Test seam: replaces the model call (and the mock-mode fixture). */
  call?: (input: FeedTextInput) => Promise<StructuredOutput>;
};

function callLive(input: FeedTextInput): Promise<StructuredOutput> {
  return callStructured({
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: FEED_TEXT_SYSTEM_PROMPT,
    content: `Write the post for this event. Persona language (if you invent one): en.\n${JSON.stringify(input)}`,
    schema: FeedTexts,
    fallback: false,
  });
}

async function callMock(input: FeedTextInput): Promise<StructuredOutput> {
  const line = (l: string) => `[${l}] ${input.event.type} — ${input.plantName}`;
  return {
    output: {
      en: line("en"),
      fr: line("fr"),
      "pt-BR": line("pt-BR"),
      persona: input.persona ? null : { summary: "A mock personality.", traits: ["calm", "curious", "green"] },
    },
    refused: false,
    usage: MOCK_USAGE,
  };
}

const cap = (text: string) => {
  const t = text.trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1).trimEnd()}…` : t;
};

/**
 * Writes the post for one event in all three languages with Haiku, once.
 * Optional AI: on a spent budget, a refusal, unusable output or an API error
 * nothing is stored and the template shows instead. At most two attempts.
 */
export async function generateFeedTexts(eventId: string, deps: FeedTextDeps = {}): Promise<"stored" | "template"> {
  const [row] = await db
    .select({ event: feedEvent, plant, speciesName: species.scientificName })
    .from(feedEvent)
    .innerJoin(plant, eq(plant.id, feedEvent.plantId))
    .leftJoin(species, eq(species.id, plant.speciesId))
    .where(eq(feedEvent.id, eventId));
  if (!row || row.event.textAttempts >= MAX_ATTEMPTS) return "template";
  const existing = await db.select({ locale: feedText.locale }).from(feedText).where(eq(feedText.eventId, eventId));
  if (existing.length > 0) return "template";

  await db
    .update(feedEvent)
    .set({ textAttempts: sql`${feedEvent.textAttempts} + 1` })
    .where(eq(feedEvent.id, eventId));

  const input: FeedTextInput = {
    plantName: row.plant.name,
    species: row.speciesName,
    persona: row.plant.persona,
    event: {
      type: row.event.type as PostType,
      payload: row.event.payload as PostPayload,
      createdAt: row.event.createdAt.toISOString(),
    },
  };
  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : callLive);

  let raw: StructuredOutput;
  try {
    raw = await withBudget("feed_text", null, MODEL, async () => {
      const out = await call(input);
      return { result: out, usage: out.usage };
    });
  } catch (error) {
    console.error(`feed text: no text for event ${eventId}`, error);
    return "template";
  }
  const parsed = raw.refused ? null : FeedTexts.safeParse(raw.output);
  if (!parsed?.success) {
    console.error(`feed text: unusable output for event ${eventId}`);
    return "template";
  }
  const texts = { en: cap(parsed.data.en), fr: cap(parsed.data.fr), "pt-BR": cap(parsed.data["pt-BR"]) };
  if (Object.values(texts).some((t) => t === "")) {
    console.error(`feed text: empty text for event ${eventId}`);
    return "template";
  }

  await db
    .insert(feedText)
    .values((Object.keys(texts) as Locale[]).map((locale) => ({ eventId, locale, text: texts[locale] })))
    .onConflictDoNothing();
  if (!row.plant.persona && parsed.data.persona?.summary) {
    await db.update(plant).set({ persona: parsed.data.persona }).where(eq(plant.id, row.plant.id));
  }
  return "stored";
}

/** The plant-voice text when it exists, otherwise a plain template in the reader's language. */
export function renderPostText(
  event: { type: PostType; payload: PostPayload; plantName: string },
  locale: Locale,
  stored: string | null,
): string {
  if (stored) return stored;
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "feed" });
  const p = event.payload;
  switch (p.type) {
    case "thanks":
      return t("template.thanks", { userName: p.userName });
    case "moment":
      return t("template.moment", { moment: t(`moments.${p.momentType}`) });
    case "photo":
      return t("template.photo", { userName: p.userName });
    case "birthday":
      return t("template.birthday", { years: p.years });
    case "mood":
      return t("template.mood", { to: p.to });
    case "season":
      return t("template.season", { growing: String(p.growing) });
    case "first":
      return t("template.first");
  }
}
