import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { env } from "@/lib/env";
import type { AiModel, Usage } from "./pricing";

let instance: Anthropic | undefined;

/** Lazy Anthropic client; the key is only read on first live call. */
export function getClient(): Anthropic {
  instance ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return instance;
}

/** What a structured call yields once a response came back (usage is always present). */
export type StructuredOutput = {
  /** Parsed JSON, or null when refused, cut off or not valid JSON. Not yet schema-validated. */
  output: unknown | null;
  refused: boolean;
  usage: Usage;
};

/**
 * One structured-output call with server-side refusal fallback. Uses `create`
 * (not `parse`) so a billed response never throws before its usage is read.
 */
export async function callStructured(args: {
  model: AiModel;
  maxTokens: number;
  system: string;
  content: string | BetaContentBlockParam[];
  schema: z.ZodType;
}): Promise<StructuredOutput> {
  const message = await getClient().beta.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.content }],
    output_config: { effort: "medium", format: zodOutputFormat(args.schema) },
  });
  const usage = message.usage as Usage;
  if (message.stop_reason === "refusal") return { output: null, refused: true, usage };
  if (message.stop_reason === "max_tokens") return { output: null, refused: false, usage };
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return { output: null, refused: false, usage };
  try {
    return { output: JSON.parse(block.text), refused: false, usage };
  } catch {
    return { output: null, refused: false, usage };
  }
}
