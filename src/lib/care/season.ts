export type Hemisphere = "N" | "S";
export type Season = "spring" | "summer" | "autumn" | "winter";

// Northern-hemisphere season for each month (1-12).
const NORTHERN_SEASON: Season[] = [
  "winter", // Jan
  "winter", // Feb
  "spring", // Mar
  "spring", // Apr
  "spring", // May
  "summer", // Jun
  "summer", // Jul
  "summer", // Aug
  "autumn", // Sep
  "autumn", // Oct
  "autumn", // Nov
  "winter", // Dec
];

/** Season of a YYYY-MM-DD day. Southern hemisphere is shifted by six months. */
export function seasonOf(day: string, hemisphere: Hemisphere): Season {
  const month = Number(day.slice(5, 7)); // 1-12
  const shifted = hemisphere === "S" ? ((month - 1 + 6) % 12) + 1 : month;
  return NORTHERN_SEASON[shifted - 1];
}

export function isGrowing(season: Season): boolean {
  return season === "spring" || season === "summer";
}

/** First occurrence of `MM-DD` strictly after `after` (YYYY-MM-DD). */
function nextAnnual(after: string, month: number, dayOfMonth: number): string {
  const year = Number(after.slice(0, 4));
  const mmdd = `${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
  const thisYear = `${year}-${mmdd}`;
  return thisYear > after ? thisYear : `${year + 1}-${mmdd}`;
}

/** First MM-15 strictly after `after`: 03-15 for N, 09-15 for S. */
export function nextSpringDay(after: string, hemisphere: Hemisphere): string {
  return nextAnnual(after, hemisphere === "N" ? 3 : 9, 15);
}

/** First MM-01 strictly after `after`: 03-01 for N, 09-01 for S. */
export function nextGrowingStart(after: string, hemisphere: Hemisphere): string {
  return nextAnnual(after, hemisphere === "N" ? 3 : 9, 1);
}
