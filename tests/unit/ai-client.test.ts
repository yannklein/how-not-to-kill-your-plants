import Anthropic, { APIConnectionError, InternalServerError } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callStructured, isTransientApiError, structuredText } from "@/lib/ai/client";

vi.mock("@/lib/env", () => ({ env: { ANTHROPIC_API_KEY: "test-key" } }));

describe("structuredText", () => {
  it("takes the first text block when there is no fallback", () => {
    expect(
      structuredText([
        { type: "thinking" },
        { type: "text", text: '{"a":1}' },
        { type: "text", text: "later" },
      ]),
    ).toBe('{"a":1}');
  });
  it("takes the text after the LAST fallback block", () => {
    expect(
      structuredText([
        { type: "text", text: '{"partial' },
        { type: "fallback" },
        { type: "text", text: '{"mid":1}' },
        { type: "fallback" },
        { type: "text", text: '{"final":1}' },
      ]),
    ).toBe('{"final":1}');
  });
  it("returns null when no text follows the last fallback", () => {
    expect(structuredText([{ type: "text", text: "partial" }, { type: "fallback" }])).toBeNull();
    expect(structuredText([])).toBeNull();
  });
});

describe("isTransientApiError", () => {
  it("is true for connection errors, 5xx and 429, false otherwise", () => {
    expect(isTransientApiError(new APIConnectionError({ message: "down" }))).toBe(true);
    expect(isTransientApiError(new InternalServerError(503, undefined, "x", new Headers()))).toBe(true);
    expect(isTransientApiError(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(isTransientApiError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
    expect(isTransientApiError(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
    expect(isTransientApiError(new Error("boom"))).toBe(false);
    expect(isTransientApiError(null)).toBe(false);
  });
});

describe("callStructured no-output paths", () => {
  afterEach(() => vi.restoreAllMocks());

  const run = async (message: Record<string, unknown>) => {
    vi.spyOn(Anthropic.Beta.Messages.prototype, "create").mockResolvedValue(message as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn.mockClear();
    const res = await callStructured({
      model: "claude-sonnet-5-5",
      maxTokens: 100,
      system: "s",
      content: "c",
      schema: z.object({ a: z.number() }),
    });
    return { res, warn };
  };
  const usage = { input_tokens: 5, output_tokens: 7 };

  it("logs stop_reason, stop_details and usage on refusal", async () => {
    const { res, warn } = await run({ stop_reason: "refusal", stop_details: { category: "bio" }, content: [], usage });
    expect(res).toMatchObject({ output: null, refused: true });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("refusal");
    expect(logged).toContain("bio");
    expect(logged).toContain("output_tokens");
  });
  it("logs on max_tokens and on invalid JSON", async () => {
    const a = await run({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"a"' }], usage });
    expect(a.res.output).toBeNull();
    expect(a.warn).toHaveBeenCalledTimes(1);
    const b = await run({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }], usage });
    expect(b.res.output).toBeNull();
    expect(b.warn).toHaveBeenCalledTimes(1);
  });
  it("uses the text after the fallback block and stays silent on success", async () => {
    const { res, warn } = await run({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"a' }, { type: "fallback" }, { type: "text", text: '{"a":2}' }],
      usage,
    });
    expect(res.output).toEqual({ a: 2 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("callStructured server-side fallback", () => {
  afterEach(() => vi.restoreAllMocks());
  const ok = { stop_reason: "end_turn", content: [{ type: "text", text: '{"a":1}' }], usage: { input_tokens: 1, output_tokens: 1 } };
  const call = async (fallback?: boolean) => {
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, "create").mockResolvedValue(ok as never);
    await callStructured({ model: "claude-haiku-5-5", maxTokens: 10, system: "s", content: "c", schema: z.object({ a: z.number() }), fallback });
    return create.mock.calls[0][0] as unknown as Record<string, unknown>;
  };

  it("asks for the fallback by default", async () => {
    expect(await call()).toMatchObject({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  });
  it("leaves it out when the model has none (Haiku 5.5)", async () => {
    const params = await call(false);
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");
  });
});
