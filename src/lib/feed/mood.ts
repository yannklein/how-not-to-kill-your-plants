import type { TaskType } from "@/lib/care/types";
import { isGrowing, type Season } from "@/lib/care/season";
import { daysBetween } from "@/lib/time";
import type { Mood } from "./types";

/** Care that matters for the plant's health; portrait/rotate/dust/mist never make it needy. */
export const MOOD_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(["water", "settle_check", "repot", "fertilize"]);

const PROUD_DAYS = 3;
const SULK_AFTER_DAYS = 3;

/** A plant's mood, derived from its care. First match wins. */
export function moodOf(input: {
  today: string;
  season: Season;
  tasks: { type: TaskType; dueOn: string; active: boolean }[];
  lastMomentOn: string | null;
}): Mood {
  const { today, season, tasks, lastMomentOn } = input;
  if (lastMomentOn && daysBetween(lastMomentOn, today) <= PROUD_DAYS) return "proud";

  const overdue = tasks
    .filter((t) => t.active && MOOD_TASK_TYPES.has(t.type))
    .map((t) => daysBetween(t.dueOn, today))
    .filter((days) => days >= 0);
  if (overdue.some((days) => days > SULK_AFTER_DAYS)) return "sulking";
  if (overdue.length > 0) return "needy";
  return isGrowing(season) ? "happy" : "sleepy";
}
