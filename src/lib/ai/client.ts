import Anthropic, { APIConnectionError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
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
 * The JSON text of a response. Server-side fallback can yield
 * [partial text, fallback, text]; the answer is the text after the LAST
 * `fallback` block. Without a fallback block, the first text block.
 */
export function structuredText(content: ReadonlyArray<{ type: string; text?: string }>): string | null {
  let from = 0;
  content.forEach((b, i) => {
    if (b.type === "fallback") from = i + 1;
  });
  const block = content.slice(from).find((b) => b.type === "text");
  return block?.text ?? null;
}

/** Connection errors, 5xx and 429: the service is unavailable, not a verdict on the request. */
export function isTransientApiError(error: unknown): boolean {
  if (
    error instanceof APIConnectionError ||
    error instanceof InternalServerError ||
    error instanceof RateLimitError
  ) {
    return true;
  }
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status >= 500 || status === 429);
}

function warnNoOutput(
  reason: string,
  message: { stop_reason: unknown; stop_details?: unknown; usage: unknown },
): void {
  console.warn(
    `callStructured: no output (${reason})`,
    JSON.stringify({
      stop_reason: message.stop_reason,
      stop_details: message.stop_details ?? null,
      usage: message.usage,
    }),
  );
}

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
  /** Server-side refusal fallback; Haiku 5.5 has none, so callers on Haiku pass false. */
  fallback?: boolean;
  /** Per-request limits for optional calls that must not hold up other work. */
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<StructuredOutput> {
  const fallback = args.fallback ?? true;
  const message = await getClient().beta.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.content }],
    output_config: { effort: "medium", format: zodOutputFormat(args.schema) },
  }, {
    ...(args.timeoutMs !== undefined ? { timeout: args.timeoutMs } : {}),
    ...(args.maxRetries !== undefined ? { maxRetries: args.maxRetries } : {}),
  });
  const usage = message.usage as Usage;
  if (message.stop_reason === "refusal") {
    warnNoOutput("refusal", message);
    return { output: null, refused: true, usage };
  }
  if (message.stop_reason === "max_tokens") {
    warnNoOutput("max_tokens", message);
    return { output: null, refused: false, usage };
  }
  const text = structuredText(message.content);
  if (text === null) {
    warnNoOutput("no text block", message);
    return { output: null, refused: false, usage };
  }
  try {
    return { output: JSON.parse(text), refused: false, usage };
  } catch {
    warnNoOutput("invalid JSON", message);
    return { output: null, refused: false, usage };
  }
}
