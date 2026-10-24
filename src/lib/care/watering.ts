import type { CareProfile } from "@/lib/ai/schemas";
import { addDays, daysBetween } from "@/lib/time";
import { isGrowing, type Season } from "./season";

export type WaterState = {
  learned: { growing: number | null; dormant: number | null };
  lastWateredOn: string | null;
  moistCount: number;
};

export const EMPTY_WATER_STATE: WaterState = {
  learned: { growing: null, dormant: null },
  lastWateredOn: null,
  moistCount: 0,
};

type WaterProfile = Pick<CareProfile, "waterIntervalDays">;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function bucketOf(season: Season): "growing" | "dormant" {
  return isGrowing(season) ? "growing" : "dormant";
}

/** Override, then the learned value for the season bucket, then the range midpoint. */
export function baseInterval(
  profile: WaterProfile,
  season: Season,
  state: WaterState,
  overrideDays: number | null,
): number {
  if (overrideDays != null) return overrideDays;
  const bucket = bucketOf(season);
  const learned = state.learned[bucket];
  if (learned != null) return learned;
  const range = profile.waterIntervalDays[bucket];
  return Math.round((range.min + range.max) / 2);
}

export function nextWater(input: {
  today: string;
  outcome: "done" | "still_moist" | "skipped";
  state: WaterState;
  profile: WaterProfile;
  season: Season;
  overrideDays: number | null;
}): { dueOn: string; state: WaterState } {
  const { today, outcome, state, profile, season, overrideDays } = input;
  const bucket = bucketOf(season);
  const base = baseInterval(profile, season, state, overrideDays);

  if (outcome === "skipped") return { dueOn: addDays(today, 1), state };

  if (outcome === "still_moist") {
    return {
      dueOn: addDays(today, clamp(Math.round(base * 0.25), 2, 7)),
      state: { ...state, moistCount: state.moistCount + 1 },
    };
  }

  // done: learn from a still_moist -> done cycle (the interval was too short).
  const learned = { ...state.learned };
  if (state.moistCount > 0 && state.lastWateredOn) {
    const actual = daysBetween(state.lastWateredOn, today);
    const range = profile.waterIntervalDays[bucket];
    learned[bucket] = clamp(
      Math.round((base + actual) / 2),
      range.min,
      Math.round(range.max * 1.5),
    );
  }
  // The override still wins over learned values for scheduling.
  const interval = overrideDays ?? learned[bucket] ?? base;
  return {
    dueOn: addDays(today, interval),
    state: { learned, lastWateredOn: today, moistCount: 0 },
  };
}
