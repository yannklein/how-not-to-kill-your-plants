import type { Suggestion } from "@/lib/gardener/types";

type T = (key: "waterEvery" | "moveTo", values: Record<string, string | number>) => string;

/** "💧 Water every 10 days" / "📍 Move to Living room window" */
export function suggestionLabel(t: T, s: Suggestion): string {
  return s.kind === "water" ? t("waterEvery", { days: s.days }) : t("moveTo", { spot: s.spotName });
}
