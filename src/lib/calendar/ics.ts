import ical, { ICalCalendarMethod } from "ical-generator";
import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/locales";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import ptBR from "../../../messages/pt-BR.json";
import { addDays } from "@/lib/time";

type TaskType = "water" | "settle_check" | "repot" | "fertilize" | "rotate" | "dust" | "mist" | "photo";
export type IcsTask = { plantName: string; type: TaskType; dueOn: string };

const MESSAGES = { en, fr, "pt-BR": ptBR };
const HORIZON_DAYS = 60;
const TYPE_ORDER: TaskType[] = ["water", "settle_check", "repot", "fertilize", "mist", "rotate", "dust", "photo"];
const LIST_AND: Record<Locale, string> = { en: "&", fr: "&", "pt-BR": "&" };

function joinNames(names: string[], locale: Locale): string {
  const and = LIST_AND[locale];
  if (names.length <= 2) return names.join(` ${and} `);
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/** "Water A & B · Rotate C" — one group per task type in a stable order. */
function summarize(tasks: IcsTask[], locale: Locale, verb: (t: TaskType) => string): string {
  const groups = TYPE_ORDER.flatMap((type) => {
    const names = tasks.filter((t) => t.type === type).map((t) => t.plantName);
    return names.length ? [`${verb(type)} ${joinNames(names, locale)}`] : [];
  });
  return `🌿 ${groups.join(" · ")}`;
}

export function buildIcs(input: {
  userId: string;
  locale: Locale;
  today: string;
  tz: string;
  appUrl: string;
  tasks: IcsTask[];
}): string {
  const { userId, locale, today, appUrl } = input;
  const t = createTranslator({ locale, messages: MESSAGES[locale] });
  const verb = (type: TaskType) => t(`care.verb.${type}`);
  const horizon = addDays(today, HORIZON_DAYS);

  const byDay = new Map<string, IcsTask[]>();
  for (const task of input.tasks) {
    if (task.dueOn > horizon) continue;
    const day = task.dueOn < today ? today : task.dueOn;
    byDay.set(day, [...(byDay.get(day) ?? []), task]);
  }

  // No `timezone` option: all-day events are floating dates, and a TZ makes the library shift DTSTART by the server offset.
  const cal = ical({ name: t("calendar.name"), method: ICalCalendarMethod.PUBLISH, ttl: 60 * 60 });
  for (const day of [...byDay.keys()].sort()) {
    const tasks = byDay.get(day)!;
    const ordered = TYPE_ORDER.flatMap((type) => tasks.filter((x) => x.type === type));
    cal.createEvent({
      id: `${userId}-${day}@plants`,
      start: new Date(`${day}T00:00:00Z`),
      allDay: true,
      summary: summarize(tasks, locale, verb),
      description: ordered.map((x) => `${verb(x.type)} ${x.plantName}`).join("\n"),
      url: appUrl,
    });
  }
  return cal.toString();
}
