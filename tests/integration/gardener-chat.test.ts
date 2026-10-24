import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, chatMessage, group, groupMember, home, plant, user } from "@/db/schema";
import { createAlert } from "@/lib/gardener/alerts";
import {
  acceptChatSuggestion,
  chatPaused,
  getThread,
  listMessages,
  seedAlertMessage,
  sendMessage,
  type ChatInput,
} from "@/lib/gardener/chat";
import { monthKeyIn } from "@/lib/time";
import { db, resetDb } from "./setup";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("gardener chat (AI_MODE=mock)", () => {
  const [Y, A, M] = ["u-y", "u-a", "u-m"];
  let plantId: string;

  beforeEach(async () => {
    await resetDb();
    await db.insert(home).values({});
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: A, name: "Adriana", email: "a@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
    const [ya, mg] = await db.insert(group).values([{ name: "YA" }, { name: "M" }]).returning({ id: group.id });
    await db.insert(groupMember).values([
      { groupId: ya.id, userId: Y },
      { groupId: ya.id, userId: A },
      { groupId: mg.id, userId: M },
    ]);
    [{ id: plantId }] = await db
      .insert(plant)
      .values({ groupId: ya.id, name: "Ficus", acquiredOn: "2026-10-01" })
      .returning({ id: plant.id });
  });

  it("answers and offers a one-tap watering change", async () => {
    const { id } = await getThread(Y, plantId);
    expect(await sendMessage(Y, id, { text: "Should I water more?" })).toEqual({ status: "ok" });
    const messages = await listMessages(Y, id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].content.text).toContain("[mock]");
    expect(messages[1].content.suggestion).toEqual({ kind: "water", days: 10 });
  });

  it("applies a suggestion once, then says it's already done", async () => {
    const { id } = await getThread(Y, plantId);
    await sendMessage(Y, id, { text: "water?" });
    const reply = (await listMessages(Y, id))[1];

    expect(await acceptChatSuggestion(Y, reply.id)).toBe("applied");
    expect((await db.select().from(plant).where(eq(plant.id, plantId)))[0].waterIntervalOverrideDays).toBe(10);
    const after = await listMessages(Y, id);
    expect(after).toHaveLength(3);
    expect(after[1].content.applied).toHaveProperty("at");
    expect(await acceptChatSuggestion(Y, reply.id)).toBe("already");
  });

  it("keeps chats private and plants within their groups", async () => {
    const { id } = await getThread(Y, plantId);
    await expect(listMessages(A, id)).rejects.toMatchObject(NOT_FOUND);
    await expect(sendMessage(A, id, { text: "hi" })).rejects.toMatchObject(NOT_FOUND);
    await expect(getThread(M, plantId)).rejects.toMatchObject(NOT_FOUND);
    expect((await getThread(A, plantId)).id).not.toBe(id);
  });

  it("pauses at the budget cap without calling the model or storing anything", async () => {
    await db.update(home).set({ aiMonthlyCapUsd: "0" });
    await db.insert(aiUsage).values({
      feature: "identify", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: "0.01", month: monthKeyIn("Europe/Madrid"),
    });
    expect(await chatPaused()).toBe(true);
    const { id } = await getThread(Y, null);
    const call = vi.fn();
    expect(await sendMessage(Y, id, { text: "hello" }, { call })).toEqual({ status: "paused" });
    expect(call).not.toHaveBeenCalled();
    expect(await db.select().from(chatMessage)).toHaveLength(0);
  });

  it("brings a warning into the conversation once", async () => {
    const alertId = (await createAlert({
      plantId, source: "photo", category: "light",
      texts: { en: "Too dark", fr: "Trop sombre", "pt-BR": "Muito escuro" }, suggestion: null,
    }))!;
    const first = await seedAlertMessage(Y, alertId);
    const second = await seedAlertMessage(Y, alertId);
    expect(second.threadId).toBe(first.threadId);
    const messages = await listMessages(Y, first.threadId);
    expect(messages.map((m) => m.content.text)).toEqual(["Too dark"]);
  });

  it("sends at most 20 earlier messages to the model", async () => {
    const { id } = await getThread(Y, plantId);
    for (let i = 0; i < 25; i++)
      await db.insert(chatMessage).values({ threadId: id, role: i % 2 ? "assistant" : "user", content: { text: `m${i}` } });
    const call = vi.fn(async (input: ChatInput) => {
      expect(input.history.length).toBeLessThanOrEqual(20);
      return { output: { text: "ok", suggestion: null }, refused: false, usage: { input_tokens: 1, output_tokens: 1 } };
    });
    await sendMessage(Y, id, { text: "latest" }, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].history.at(-1)).toEqual({ role: "user", text: "latest" });
  });
});
