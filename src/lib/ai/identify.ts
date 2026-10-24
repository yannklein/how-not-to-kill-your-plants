import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Locale } from "@/i18n/locales";
import { env } from "@/lib/env";
import { withBudget } from "./budget";
import { getClient } from "./client";
import { mockIdentify, MOCK_USAGE } from "./mock";
import { NOT_A_PLANT, IdentifyResult, trimIdentify } from "./schemas";

const MODEL = "claude-sonnet-5-5" as const;

// Stable prefix: no dates, no user data (cached). Locale goes in the user turn.
export const IDENTIFY_SYSTEM_PROMPT = `You identify houseplants from photos for a small household plant-care app.

Rules:
- First decide whether the photos show a plant at all (isPlant). If not, return isPlant false and empty candidates.
- Return up to 3 candidates for the species, best first, with scientific names (genus and species; add a cultivar only if clear) and an honest confidence from 0 to 1.
- If a plant label or tag is visible, treat its text as a strong hint: a legible label outweighs the appearance of the plant. Put the label text in labelText, otherwise null.
- Estimate the pot diameter in centimetres (potSizeCm) if a pot is visible, otherwise null.
- Give exactly 3 playful, affectionate suggestedNames and a persona: a short playful summary and exactly 3 personality traits.
- Write all user-facing strings (commonName, suggestedNames, persona) in the language requested in the user message. Scientific names stay in Latin.`;

type IdentifyInput = {
  images: { base64: string; mediaType: "image/jpeg" }[];
  locale: Locale;
  userId: string;
};

async function identifyLive(input: IdentifyInput) {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: IDENTIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...input.images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text" as const, text: `Identify this plant. Answer in locale: ${input.locale}.` },
        ],
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(IdentifyResult) },
  });
  const refused = response.stop_reason === "refusal" || response.parsed_output == null;
  return {
    result: refused ? NOT_A_PLANT : trimIdentify(response.parsed_output!),
    usage: response.usage,
  };
}

export async function identifyPlant(input: IdentifyInput): Promise<IdentifyResult> {
  return withBudget("identify", input.userId, MODEL, async () =>
    env.AI_MODE === "mock"
      ? { result: mockIdentify, usage: MOCK_USAGE }
      : identifyLive(input),
  );
}
