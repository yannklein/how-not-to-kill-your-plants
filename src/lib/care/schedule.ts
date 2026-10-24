import type { CareProfile } from "@/lib/ai/schemas";
import { addDays, addMonths } from "@/lib/time";
import { isGrowing, nextGrowingStart, nextSpringDay, seasonOf, type Hemisphere } from "./season";
import type { TaskOutcome, TaskType } from "./types";
import { EMPTY_WATER_STATE, nextWater, type WaterState } from "./watering";

/** The scheduling-relevant part of a care profile. */
export type ScheduleProfile = Pick<
  CareProfile,
  | "waterIntervalDays"
  | "repotEveryMonths"
  | "fertilizeEveryDays"
  | "rotateEveryDays"
  | "dustEveryDays"
  | "mistEveryDays"
>;

export function initialTasks(input: {
  today: string;
  acquiredOn: string;
  justBought: boolean;
  profile: ScheduleProfile;
  hemisphere: Hemisphere;
}): { type: TaskType; dueOn: string; state?: WaterState }[] {
  const { today, acquiredOn, justBought, profile, hemisphere } = input;
  const tasks: { type: TaskType; dueOn: string; state?: WaterState }[] = [
    {
      type: "water",
      dueOn: addDays(today, justBought ? 3 : 1),
      state: EMPTY_WATER_STATE,
    },
  ];
  if (justBought) tasks.push({ type: "settle_check", dueOn: addDays(acquiredOn, 14) });
  else tasks.push({ type: "repot", dueOn: nextSpringDay(today, hemisphere) });
  tasks.push({
    type: "fertilize",
    dueOn: isGrowing(seasonOf(today, hemisphere))
      ? addDays(today, profile.fertilizeEveryDays)
      : nextGrowingStart(today, hemisphere),
  });
  tasks.push({ type: "rotate", dueOn: addDays(today, profile.rotateEveryDays) });
  tasks.push({ type: "dust", dueOn: addDays(today, profile.dustEveryDays) });
  if (profile.mistEveryDays != null) {
    tasks.push({ type: "mist", dueOn: addDays(today, profile.mistEveryDays) });
  }
  // The photos taken when adding the plant are its first portrait.
  tasks.push({ type: "photo", dueOn: addMonths(today, 1) });
  return tasks;
}

export function nextDue(input: {
  type: TaskType;
  outcome: TaskOutcome;
  today: string;
  profile: ScheduleProfile;
  hemisphere: Hemisphere;
  state?: WaterState;
  overrideDays?: number | null;
}): { dueOn: string | null; state?: WaterState; spawn?: { type: "repot"; dueOn: string } } {
  const { type, outcome, today, profile, hemisphere } = input;
  switch (type) {
    case "water": {
      if (outcome !== "done" && outcome !== "still_moist" && outcome !== "skipped") {
        throw new Error(`Invalid water outcome: ${outcome}`);
      }
      return nextWater({
        today,
        outcome,
        state: input.state ?? EMPTY_WATER_STATE,
        profile,
        season: seasonOf(today, hemisphere),
        overrideDays: input.overrideDays ?? null,
      });
    }
    case "settle_check":
      if (outcome === "rootbound_yes") {
        return { dueOn: null, spawn: { type: "repot", dueOn: addDays(today, 3) } };
      }
      if (outcome === "rootbound_no") {
        return {
          dueOn: null,
          spawn: { type: "repot", dueOn: nextSpringDay(addDays(today, 30), hemisphere) },
        };
      }
      throw new Error(`Invalid settle_check outcome: ${outcome}`);
    case "repot":
      // Skipped: ask again next spring rather than counting a full repot cycle.
      if (outcome === "skipped") return { dueOn: nextSpringDay(today, hemisphere) };
      return {
        dueOn: nextSpringDay(addMonths(today, profile.repotEveryMonths - 2), hemisphere),
      };
    case "fertilize": {
      const candidate = addDays(today, profile.fertilizeEveryDays);
      return {
        dueOn: isGrowing(seasonOf(candidate, hemisphere))
          ? candidate
          : nextGrowingStart(candidate, hemisphere),
      };
    }
    case "rotate":
      return { dueOn: addDays(today, profile.rotateEveryDays) };
    case "dust":
      return { dueOn: addDays(today, profile.dustEveryDays) };
    case "mist":
      // Profile no longer calls for misting: retire the task.
      return {
        dueOn: profile.mistEveryDays == null ? null : addDays(today, profile.mistEveryDays),
      };
    case "photo":
      // Monthly portrait: done or skipped, it asks again a month later.
      return { dueOn: addMonths(today, 1) };
  }
}
