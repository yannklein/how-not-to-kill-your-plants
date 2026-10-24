import type { TaskOutcome, TaskType } from "@/lib/care/types";
import { MOOD_TASK_TYPES } from "@/lib/feed/mood";
import type { Mood } from "@/lib/feed/types";
import { daysBetween } from "@/lib/time";
import type { AlertCategory } from "./types";

export type PatternFlag = {
  rule: "moist_streak" | "skip_streak" | "overdue" | "sulking";
  category: AlertCategory;
  detail: string;
};

const STREAK = 3;
const LONG_DAYS = 7;

/** Answers of one task type, newest first, until the first different outcome. */
function streak(completions: { taskType: TaskType; outcome: TaskOutcome }[], type: TaskType, outcome: TaskOutcome) {
  let n = 0;
  for (const c of completions) {
    if (c.taskType !== type) continue;
    if (c.outcome !== outcome) break;
    n++;
  }
  return n;
}

/** Warning signs in a plant's care history that are worth the gardener's attention. Pure. */
export function flagPatterns(input: {
  today: string;
  completions: { taskType: TaskType; outcome: TaskOutcome; day: string }[]; // newest first
  tasks: { type: TaskType; dueOn: string; active: boolean }[];
  lastMood: Mood | null;
  lastMoodOn: string | null;
}): PatternFlag[] {
  const { today, completions, tasks, lastMood, lastMoodOn } = input;
  const flags: PatternFlag[] = [];

  const moist = streak(completions, "water", "still_moist");
  if (moist >= STREAK) flags.push({ rule: "moist_streak", category: "overwatering", detail: `still moist ${moist}× in a row` });

  const skippedType = [...new Set(completions.map((c) => c.taskType))].find(
    (type) => streak(completions, type, "skipped") >= STREAK,
  );
  if (skippedType) flags.push({ rule: "skip_streak", category: "other", detail: `${skippedType} skipped ${STREAK}+× in a row` });

  const overdue = tasks
    .filter((t) => t.active && MOOD_TASK_TYPES.has(t.type) && daysBetween(t.dueOn, today) > LONG_DAYS)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  if (overdue) {
    flags.push({
      rule: "overdue",
      category: overdue.type === "water" ? "underwatering" : "other",
      detail: `${overdue.type} ${daysBetween(overdue.dueOn, today)} days overdue`,
    });
  }

  if (lastMood === "sulking" && lastMoodOn && daysBetween(lastMoodOn, today) > LONG_DAYS) {
    flags.push({ rule: "sulking", category: "other", detail: `sulking for ${daysBetween(lastMoodOn, today)} days` });
  }
  return flags;
}
