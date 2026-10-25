import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { db } from "@/db/client";
import { tip, tipRecipient } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { withBudget } from "@/lib/ai/budget";
import { callStructured, type StructuredOutput } from "@/lib/ai/client";
import { MOCK_USAGE } from "@/lib/ai/mock";
import { env } from "@/lib/env";
import type { TipCandidate, TipKind } from "./triggers";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import ptBR from "../../../messages/pt-BR.json";

const MODEL = "claude-haiku-5-5" as const;
const MESSAGES = { en, fr, "pt-BR": ptBR } as const;

export const TIP_SYSTEM_PROMPT = `You are the gardener of a small household plant-care app: one calm, friendly expert. Write one short, useful tip (one or two sentences, starting with "💡") for the situation given, in English (en), French (fr) and Brazilian Portuguese (pt-BR). Practical and specific to the plant when one is named. Organic and non-chemical options first. Plain text, no Markdown.`;

const TipTexts = z.object({ en: z.string(), fr: z.string(), "pt-BR": z.string() });

export type TipDeps = { call?: (c: TipCandidate) => Promise<StructuredOutput> };

function callLive(c: TipCandidate): Promise<StructuredOutput> {
  return callStructured({
    model: MODEL,
    maxTokens: 4_000,
    system: TIP_SYSTEM_PROMPT,
    content: `Situation: ${c.params.situation ?? c.kind}\nCategory: ${c.category ?? "general"}`,
    schema: TipTexts,
    fallback: false, // Haiku 5.5 has no server-side fallback
    timeoutMs: 30_000,
    maxRetries: 1,
  });
}

async function callMock(c: TipCandidate): Promise<StructuredOutput> {
  const line = (l: string) => `💡 [mock ${l}] tip ${c.kind}`;
  return { output: { en: line("en"), fr: line("fr"), "pt-BR": line("pt-BR") }, refused: false, usage: MOCK_USAGE };
}

/**
 * Stores a tip once per trigger key and queues it for its recipients, then
 * writes it in three languages. Optional AI: without text the template shows.
 */
export async function createTip(c: TipCandidate, deps: TipDeps = {}): Promise<string | null> {
  const [row] = await db
    .insert(tip)
    .values({ kind: c.kind, plantId: c.plantId, category: c.category, triggerKey: c.triggerKey, params: c.params })
    .onConflictDoNothing({ target: tip.triggerKey })
    .returning({ id: tip.id });
  if (!row) return null;
  if (c.recipients.length) {
    await db
      .insert(tipRecipient)
      .values(c.recipients.map((userId) => ({ tipId: row.id, userId })))
      .onConflictDoNothing();
  }

  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : callLive);
  try {
    const out = await withBudget("tips", null, MODEL, async () => {
      const r = await call(c);
      return { result: r, usage: r.usage };
    });
    const parsed = out.refused ? null : TipTexts.safeParse(out.output);
    if (parsed?.success && Object.values(parsed.data).every((t) => t.trim())) {
      const texts = { en: parsed.data.en.trim(), fr: parsed.data.fr.trim(), "pt-BR": parsed.data["pt-BR"].trim() };
      await db.update(tip).set({ texts }).where(eq(tip.id, row.id));
    }
  } catch (error) {
    console.error(`tip text: template for ${c.triggerKey}`, error);
  }
  return row.id;
}

/** The gardener's words when written, otherwise the template in the reader's language. */
export function renderTipText(
  t: { kind: TipKind; texts: Record<Locale, string> | null; params: Record<string, string | number | boolean> },
  locale: Locale,
): string {
  const written = t.texts?.[locale];
  if (written) return written;
  const tr = createTranslator({ locale, messages: MESSAGES[locale], namespace: "tips" });
  const p = Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, String(v)]));
  return tr(`template.${t.kind}`, p);
}
