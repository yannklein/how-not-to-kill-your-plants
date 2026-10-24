import type { aiFeature } from "@/db/schema";

export type AiModel = "claude-sonnet-5-5" | "claude-haiku-5-5";
export type AiFeature = (typeof aiFeature.enumValues)[number];

/** The subset of the SDK usage shape that determines cost. */
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** USD per million tokens. */
export const PRICING: Record<
  AiModel,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function costUsd(model: AiModel, usage: Usage): number {
  const p = PRICING[model];
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}
