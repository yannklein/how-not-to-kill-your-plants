import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveChatCall } from "@/lib/gardener/chat";
import { liveCheckCall } from "@/lib/gardener/checks";

vi.mock("@/lib/env", () => ({ env: { ANTHROPIC_API_KEY: "test-key", AI_MODE: "live" } }));

const ok = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"hi","suggestion":null}' }], usage: { input_tokens: 1, output_tokens: 1 } };

describe("gardener calls give up instead of hanging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("limits a chat reply to 60 s and one retry", async () => {
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, "create").mockResolvedValue(ok as never);
    await liveChatCall({
      locale: "en",
      household: { home: { city: "Barcelona", season: "autumn" }, spots: [], plants: [] },
      plant: null,
      history: [{ role: "user", text: "hi" }],
    });
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: 60_000, maxRetries: 1 });
  });

  it("limits a health check to 90 s and one retry", async () => {
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, "create").mockResolvedValue(ok as never);
    await liveCheckCall({
      kind: "pattern",
      plantName: "Ficus",
      context: {} as never,
      spots: [],
      flags: [],
      photoKeys: [],
    });
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: 90_000, maxRetries: 1 });
  });
});

describe("gardener answers render cleanly in the chat", () => {
  it("asks for plain text, because the chat doesn't render Markdown", async () => {
    const { GARDENER_SYSTEM_PROMPT } = await import("@/lib/gardener/chat");
    const { HEALTH_CHECK_SYSTEM_PROMPT } = await import("@/lib/gardener/checks");
    for (const prompt of [GARDENER_SYSTEM_PROMPT, HEALTH_CHECK_SYSTEM_PROMPT]) expect(prompt).toMatch(/plain text, no Markdown/);
  });
});
