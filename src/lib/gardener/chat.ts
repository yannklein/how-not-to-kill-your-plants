import { and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { chatMessage, chatThread, gardenerAlert, plant, user } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/locales";
import { getPlantForUser } from "@/lib/access";
import { monthSpend, withBudget } from "@/lib/ai/budget";
import { callStructured, type StructuredOutput } from "@/lib/ai/client";
import { MOCK_USAGE } from "@/lib/ai/mock";
import { env } from "@/lib/env";
import { assertDraftKeys } from "@/lib/photos";
import { getObjectBytes } from "@/lib/storage";
import { householdContext, plantContext, type PlantContext } from "./context";
import { applySuggestion, usableSuggestion } from "./suggestions";
import type { ChatContent, Suggestion } from "./types";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import ptBR from "../../../messages/pt-BR.json";

const MODEL = "claude-sonnet-5-5" as const;
const MAX_TOKENS = 16_000;
const HISTORY = 20;
const MESSAGES = { en, fr, "pt-BR": ptBR } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GARDENER_SYSTEM_PROMPT = `You are the gardener of a small household plant-care app for three friends sharing an apartment: one calm, friendly, expert gardener (not the plants themselves).

- Answer briefly and practically, in the user's language (given as "locale"). Write plain text, no Markdown (no asterisks, headings or bullet symbols); short paragraphs are fine.
- You already know the household's plants, spots and season, and the plant in focus if there is one: never ask for details you were given.
- Organic and non-chemical remedies first.
- If you are unsure, say so and ask for a photo or one specific detail rather than guessing.
- When a concrete change would clearly help the plant in focus, you may propose ONE: a watering interval in days (1-60), or moving it to one of the listed spots (by id). The user applies it with one tap; never claim you applied it yourself.`;

export const ChatReply = z.object({
  text: z.string(),
  suggestion: z
    .union([
      z.object({ kind: z.literal("water"), days: z.number() }),
      z.object({ kind: z.literal("spot"), spotId: z.string() }),
    ])
    .nullable(),
});

export type ChatInput = {
  locale: Locale;
  household: Awaited<ReturnType<typeof householdContext>>;
  plant: PlantContext | null;
  history: { role: "user" | "assistant"; text: string }[];
  photoKey?: string;
};
export type ChatDeps = { call?: (input: ChatInput) => Promise<StructuredOutput> };

/** The real model call (exported for its request-limit test). */
export async function liveChatCall(input: ChatInput): Promise<StructuredOutput> {
  const image = input.photoKey
    ? [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/jpeg" as const,
            data: (await getObjectBytes(input.photoKey)).toString("base64"),
          },
        },
      ]
    : [];
  return callStructured({
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: GARDENER_SYSTEM_PROMPT,
    content: [...image, { type: "text" as const, text: JSON.stringify({ ...input, photoKey: undefined }) }],
    schema: ChatReply,
    // A stuck call must not leave "thinking…" hanging; the fallback reply shows instead.
    timeoutMs: 60_000,
    maxRetries: 1,
  });
}

/** Offline stand-in: echoes the question; a question about water gets a 10-day suggestion. */
async function callMock(input: ChatInput): Promise<StructuredOutput> {
  const question = input.history.at(-1)?.text ?? "";
  return {
    output: {
      text: `[mock] ${question}`,
      suggestion: /water/i.test(question) ? { kind: "water", days: 10 } : null,
    },
    refused: false,
    usage: MOCK_USAGE,
  };
}

async function localeOf(userId: string): Promise<Locale> {
  const [row] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  return row && isLocale(row.locale) ? row.locale : "en";
}

const t = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale], namespace: "gardener" });

/** The user's conversation about one plant (or the general one), created on first use. */
export async function getThread(userId: string, plantId: string | null): Promise<{ id: string }> {
  if (plantId) await getPlantForUser(userId, plantId);
  const where = and(eq(chatThread.userId, userId), plantId ? eq(chatThread.plantId, plantId) : isNull(chatThread.plantId));
  const [existing] = await db.select({ id: chatThread.id }).from(chatThread).where(where).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(chatThread).values({ userId, plantId }).returning({ id: chatThread.id });
  return created;
}

/** A thread of this user, or 404: conversations are private. */
async function ownThread(userId: string, threadId: string) {
  if (!UUID.test(threadId)) notFound();
  const [thread] = await db.select().from(chatThread).where(eq(chatThread.id, threadId));
  if (!thread || thread.userId !== userId) notFound();
  if (thread.plantId) await getPlantForUser(userId, thread.plantId);
  return thread;
}

export type ChatMessageView = { id: string; role: "user" | "assistant"; content: ChatContent; createdAt: Date };

export async function listMessages(userId: string, threadId: string): Promise<ChatMessageView[]> {
  await ownThread(userId, threadId);
  const rows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(asc(chatMessage.createdAt), asc(chatMessage.id));
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content as ChatContent, createdAt: r.createdAt }));
}

export async function listThreads(
  userId: string,
): Promise<{ id: string; plantId: string | null; plantName: string | null; lastAt: Date }[]> {
  const rows = await db
    .select({
      id: chatThread.id,
      plantId: chatThread.plantId,
      plantName: plant.name,
      createdAt: chatThread.createdAt,
      lastAt: max(chatMessage.createdAt),
    })
    .from(chatThread)
    .leftJoin(plant, eq(plant.id, chatThread.plantId))
    .leftJoin(chatMessage, eq(chatMessage.threadId, chatThread.id))
    .where(eq(chatThread.userId, userId))
    .groupBy(chatThread.id, plant.name)
    .orderBy(desc(sql`coalesce(max(${chatMessage.createdAt}), ${chatThread.createdAt})`));
  return rows.map((r) => ({ id: r.id, plantId: r.plantId, plantName: r.plantName, lastAt: r.lastAt ?? r.createdAt }));
}

/** True once the month's AI spend has reached the cap: the gardener is back next month. */
export async function chatPaused(): Promise<boolean> {
  const { spentUsd, capUsd } = await monthSpend();
  return spentUsd >= capUsd;
}

async function addMessage(threadId: string, role: "user" | "assistant", content: ChatContent) {
  await db.insert(chatMessage).values({ threadId, role, content, createdAt: new Date() });
}

/** Asks the gardener. Only plant conversations carry suggestions, which must target a known spot. */
export async function sendMessage(
  userId: string,
  threadId: string,
  input: { text: string; photoKey?: string },
  deps: ChatDeps = {},
): Promise<{ status: "ok"; plantId: string | null } | { status: "paused" }> {
  const thread = await ownThread(userId, threadId);
  const text = input.text.trim().slice(0, 2000);
  const photoKey = input.photoKey ? assertDraftKeys([input.photoKey])[0] : undefined;
  if (!text && !photoKey) return { status: "ok", plantId: thread.plantId };
  if (await chatPaused()) return { status: "paused" };

  await addMessage(threadId, "user", { text, ...(photoKey ? { photoKey } : {}) });
  const locale = await localeOf(userId);
  const [household, focus, earlier] = await Promise.all([
    householdContext(userId),
    thread.plantId ? plantContext(thread.plantId) : Promise.resolve(null),
    db
      .select({ role: chatMessage.role, content: chatMessage.content })
      .from(chatMessage)
      .where(eq(chatMessage.threadId, threadId))
      .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
      .limit(HISTORY),
  ]);
  const history = earlier.reverse().map((m) => ({ role: m.role, text: (m.content as ChatContent).text }));
  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : liveChatCall);

  let reply: ChatContent = { text: t(locale)("fallback") };
  try {
    const raw = await withBudget("chat", userId, MODEL, async () => {
      const out = await call({ locale, household, plant: focus, history, photoKey });
      return { result: out, usage: out.usage };
    });
    const parsed = raw.refused ? null : ChatReply.safeParse(raw.output);
    if (parsed?.success && parsed.data.text.trim()) {
      const suggestion = thread.plantId ? usableSuggestion(parsed.data.suggestion, household.spots) : null;
      reply = { text: parsed.data.text.trim(), ...(suggestion ? { suggestion } : {}) };
    }
  } catch (error) {
    console.error(`gardener chat failed for thread ${threadId}`, error);
  }
  await addMessage(threadId, "assistant", reply);
  return { status: "ok", plantId: thread.plantId };
}

/** One tap on a suggestion in the chat. Each suggestion can be used once. */
export async function acceptChatSuggestion(
  userId: string,
  messageId: string,
): Promise<"applied" | "gone" | "same" | "already"> {
  if (!UUID.test(messageId)) notFound();
  const [row] = await db.select().from(chatMessage).where(eq(chatMessage.id, messageId));
  if (!row) notFound();
  const thread = await ownThread(userId, row.threadId);
  const content = row.content as ChatContent;
  if (!content.suggestion || !thread.plantId) notFound();

  // Claim the suggestion first so a double tap can't apply it twice.
  const claimed = await db
    .update(chatMessage)
    .set({ content: { ...content, applied: { at: new Date().toISOString() } } })
    .where(and(eq(chatMessage.id, messageId), sql`${chatMessage.content}->'applied' is null`))
    .returning({ id: chatMessage.id });
  if (claimed.length === 0) return "already";

  const result = await applySuggestion(userId, thread.plantId, content.suggestion);
  if (result !== "applied") {
    await db.update(chatMessage).set({ content: { ...content, applied: { failed: result } } }).where(eq(chatMessage.id, messageId));
    return result;
  }
  const tr = t(await localeOf(userId));
  const s = content.suggestion;
  await addMessage(row.threadId, "assistant", {
    text: s.kind === "water" ? tr("confirmWater", { days: s.days }) : tr("confirmSpot", { spot: s.spotName }),
  });
  return "applied";
}

/** "Ask the gardener" on a warning: the warning appears once in this user's conversation about the plant. */
export async function seedAlertMessage(userId: string, alertId: string): Promise<{ threadId: string }> {
  if (!UUID.test(alertId)) notFound();
  const [alert] = await db.select().from(gardenerAlert).where(eq(gardenerAlert.id, alertId));
  if (!alert) notFound();
  const { id: threadId } = await getThread(userId, alert.plantId);
  const [seen] = await db
    .select({ id: chatMessage.id })
    .from(chatMessage)
    .where(and(eq(chatMessage.threadId, threadId), sql`${chatMessage.content}->>'alertId' = ${alertId}`))
    .limit(1);
  if (!seen) {
    const locale = await localeOf(userId);
    const suggestion = (alert.suggestion as Suggestion | null) ?? undefined;
    await addMessage(threadId, "assistant", {
      text: alert.texts[locale] || alert.texts.en,
      alertId,
      ...(suggestion ? { suggestion } : {}),
    });
  }
  return { threadId };
}
