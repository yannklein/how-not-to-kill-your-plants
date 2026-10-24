import type { CareProfile, IdentifyResult } from "./schemas";
import type { Usage } from "./pricing";

/** Mock usage that costs exactly $0.01 on claude-sonnet-5-5 (1000 output tokens). */
export const MOCK_USAGE: Usage = { input_tokens: 0, output_tokens: 1000 };

export const mockIdentify: IdentifyResult = {
  isPlant: true,
  candidates: [
    { scientificName: "Pilea peperomioides", commonName: "Chinese money plant", confidence: 0.92 },
    { scientificName: "Peperomia polybotrya", commonName: "Raindrop peperomia", confidence: 0.05 },
  ],
  labelText: null,
  potSizeCm: 12,
  suggestedNames: ["Penny", "Coinsworth", "Pilea Pan"],
  persona: {
    summary: "A cheerful, round-leaved show-off that leans toward the light.",
    traits: ["sunny", "dramatic", "generous with pups"],
  },
};

const text = (lang: string) => ({
  summary: `[${lang}] Easygoing houseplant that likes bright, indirect light.`,
  soilMix: `[${lang}] Airy mix: potting soil, perlite and a little compost.`,
  organicFertilizers: [`[${lang}] Diluted worm-casting tea`, `[${lang}] Seaweed extract`],
  commonProblems: [`[${lang}] Leaf curl from too much sun`, `[${lang}] Root rot from overwatering`],
  toxicity: `[${lang}] Non-toxic to cats and dogs.`,
});

export const mockProfile: CareProfile = {
  light: "bright_indirect",
  waterIntervalDays: { growing: { min: 7, max: 10 }, dormant: { min: 10, max: 14 } },
  humidity: "medium",
  tempC: { min: 15, max: 27 },
  repotEveryMonths: 18,
  fertilizeEveryDays: 30,
  rotateEveryDays: 7,
  dustEveryDays: 30,
  mistEveryDays: null,
  text: { en: text("en"), fr: text("fr"), "pt-BR": text("pt-BR") },
};
