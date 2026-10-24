// Home-timezone helpers. Day strings are calendar dates (YYYY-MM-DD) with no
// time zone. Day arithmetic runs in UTC so DST never shifts a day.

const DAY_MS = 24 * 60 * 60 * 1000;

type Clock = { year: string; month: string; day: string; hour: string; minute: string };

function clockIn(tz: string, now: Date): Clock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Calendar date (YYYY-MM-DD) for `now` in the given time zone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  const c = clockIn(tz, now);
  return `${c.year}-${c.month}-${c.day}`;
}

/** Local wall-clock time (24h HH:MM, zero-padded) for `now` in the given time zone. */
export function localTimeIn(tz: string, now: Date = new Date()): string {
  const c = clockIn(tz, now);
  return `${c.hour}:${c.minute}`;
}

/** Calendar month (YYYY-MM) for `now` in the given time zone. */
export function monthKeyIn(tz: string, now: Date = new Date()): string {
  const c = clockIn(tz, now);
  return `${c.year}-${c.month}`;
}

function utcMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Adds `n` calendar days to a YYYY-MM-DD day. */
export function addDays(day: string, n: number): string {
  return new Date(utcMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Number of calendar days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}
