export const ALERT_CATEGORIES = [
  "light",
  "overwatering",
  "underwatering",
  "pests",
  "nutrients",
  "temperature",
  "humidity",
  "repot",
  "other",
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

/** A concrete change the gardener proposes; applied only when the user taps it. */
export type Suggestion = { kind: "water"; days: number } | { kind: "spot"; spotId: string; spotName: string };

/** What a chat message stores. `applied` records the outcome of tapping its suggestion. */
export type ChatContent = {
  text: string;
  photoKey?: string;
  suggestion?: Suggestion;
  applied?: { at: string } | { failed: "gone" | "same" };
  /** Set when this message brings a health warning into the conversation. */
  alertId?: string;
};
