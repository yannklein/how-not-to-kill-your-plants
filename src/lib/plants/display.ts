import type { species } from "@/db/schema";

/** "Common name (Scientific name)" in the user's language when a common name is known. */
export function speciesLabel(sp: typeof species.$inferSelect, locale?: "en" | "fr" | "pt-BR"): string {
  const common = (locale && sp.commonNames[locale]) || sp.commonNames.en;
  return common && common !== sp.scientificName ? `${common} (${sp.scientificName})` : sp.scientificName;
}
