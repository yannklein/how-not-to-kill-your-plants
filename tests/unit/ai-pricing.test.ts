import { describe, expect, it } from "vitest";
import { costUsd } from "@/lib/ai/pricing";

describe("costUsd", () => {
  it("prices sonnet input", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(2);
  });
  it("prices haiku output", () => {
    expect(costUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1_000_000 })).toBe(0.5);
  });
  it("prices cache reads and writes", () => {
    expect(
      costUsd("claude-sonnet-5-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBe(0.2);
    expect(
      costUsd("claude-sonnet-5-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBe(2.5);
  });
});
