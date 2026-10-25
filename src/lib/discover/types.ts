export type Effort = "easy" | "medium" | "devoted";
export type Want = "looks" | "home" | "edible";
export type WindowDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "none";

export type DiscoverInput = {
  spotId: string | null;
  newSpot: { windowDirection: WindowDirection; distance: "close" | "middle" | "far" } | null;
  effort: Effort;
  wants: Want[];
  style: string;
};

/** One suggestion, written in the language of the search. */
export type DiscoverCard = {
  scientificName: string;
  commonName: string;
  whyItFits: string;
  ease: string;
  goesWith: string;
  benefits: string;
  safety: string;
  harvest: string | null;
};
