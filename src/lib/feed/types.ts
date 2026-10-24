import type { Season } from "@/lib/care/season";
import type { TaskType } from "@/lib/care/types";

export type Mood = "proud" | "sulking" | "needy" | "sleepy" | "happy";
export type MomentType = "new_leaf" | "new_growth" | "flower" | "repotted";
export type PostType = "thanks" | "moment" | "photo" | "birthday" | "mood" | "season" | "first";

export const MOMENT_TYPES: readonly MomentType[] = ["new_leaf", "new_growth", "flower", "repotted"];

/** Posts that rank above routine ones in the highlights. */
export const BIG_POST_TYPES: ReadonlySet<PostType> = new Set<PostType>(["moment", "photo", "birthday", "first"]);

export const MOOD_EMOJI: Record<Mood, string> = {
  proud: "🥳",
  sulking: "😤",
  needy: "🥵",
  sleepy: "😴",
  happy: "😊",
};

/** Event payloads, stored once in neutral form. `mood` is the plant's mood when the event happened. */
export type PostPayload =
  | { type: "thanks"; mood: Mood; userId: string; userName: string; taskType: TaskType }
  | {
      type: "moment";
      mood: Mood;
      momentId: string;
      momentType: MomentType;
      photoId: string | null;
      userName: string;
      firstFlower: boolean;
    }
  | { type: "photo"; mood: Mood; photoId: string; userName: string; previousPhotoAt: string | null }
  | { type: "birthday"; mood: Mood; kind: "month" | "year"; years: number }
  | { type: "mood"; mood: Mood; from: Mood; to: Mood }
  | { type: "season"; mood: Mood; season: Season; growing: boolean }
  | { type: "first"; mood: Mood; userName: string };

export type PayloadOf<T extends PostType> = Extract<PostPayload, { type: T }>;
