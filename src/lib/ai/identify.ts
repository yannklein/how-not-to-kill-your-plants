import type { Locale } from "@/i18n/locales";
import { env } from "@/lib/env";
import { withBudget } from "./budget";
import { callStructured, type StructuredOutput } from "./client";
import { mockIdentify, MOCK_USAGE } from "./mock";
import { IdentifyResult, NOT_A_PLANT, trimIdentify } from "./schemas";

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

export type IdentifyInput = {
  images: { base64: string; mediaType: "image/jpeg" }[];
  locale: Locale;
  userId: string;
};

export type IdentifyOutcome = IdentifyResult & {
  /** Set when the model could not answer; the UI should fall back to free-text species entry. */
  failure?: "refused" | "error";
};

export type IdentifyDeps = {
  /** Test seam: replaces the model call (and the mock-mode fixture). */
  call?: (input: IdentifyInput) => Promise<StructuredOutput>;
};

function callLive(input: IdentifyInput): Promise<StructuredOutput> {
  return callStructured({
    model: MODEL,
    maxTokens: 4000,
    system: IDENTIFY_SYSTEM_PROMPT,
    content: [
      ...input.images.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
      })),
      { type: "text" as const, text: `Identify this plant. Answer in locale: ${input.locale}.` },
    ],
    schema: IdentifyResult,
  });
}

async function callMock(): Promise<StructuredOutput> {
  return { output: mockIdentify, refused: false, usage: MOCK_USAGE };
}

/** Never throws for model, API or parse failures; see `failure`. */
export async function identifyPlant(
  input: IdentifyInput,
  deps: IdentifyDeps = {},
): Promise<IdentifyOutcome> {
  const call = deps.call ?? (env.AI_MODE === "mock" ? callMock : callLive);
  let raw: StructuredOutput;
  try {
    raw = await withBudget("identify", input.userId, MODEL, async () => {
      const out = await call(input);
      return { result: out, usage: out.usage };
    });
  } catch (error) {
    console.error("identifyPlant failed", error);
    return { ...NOT_A_PLANT, failure: "error" };
  }
  if (raw.refused) return { ...NOT_A_PLANT, failure: "refused" };
  const parsed = IdentifyResult.safeParse(raw.output);
  if (!parsed.success) {
    console.error("identifyPlant: unusable model output", parsed.error?.message);
    return { ...NOT_A_PLANT, failure: "error" };
  }
  return trimIdentify(parsed.data);
}
