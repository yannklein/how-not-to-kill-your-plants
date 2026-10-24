import { addMonths, todayIn } from "@/lib/time";

/** The day a plant joined the app, in the home timezone. */
export function joinedOn(createdAt: Date, tz: string): string {
  return todayIn(tz, createdAt);
}

/** One month after joining, then every yearly anniversary (29 Feb → 28 Feb in other years). */
export function birthdayKind(joined: string, today: string): { kind: "month" | "year"; years: number } | null {
  if (addMonths(joined, 1) === today) return { kind: "month", years: 0 };
  const years = Number(today.slice(0, 4)) - Number(joined.slice(0, 4));
  if (years >= 1 && addMonths(joined, 12 * years) === today) return { kind: "year", years };
  return null;
}
