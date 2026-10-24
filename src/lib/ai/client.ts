import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let instance: Anthropic | undefined;

/** Lazy Anthropic client; the key is only read on first live call. */
export function getClient(): Anthropic {
  instance ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return instance;
}
