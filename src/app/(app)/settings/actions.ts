"use server";

import { revalidatePath } from "next/cache";
import { regenerateCalendarToken as regenerateLib, calendarUrl } from "@/lib/calendar/tokens";
import type { Locale } from "@/i18n/locales";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { setLocale as setLocaleLib, setPushTime as setPushTimeLib } from "@/lib/settings";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false };

// requireUser() stays outside the try block: it signals via redirect exceptions.
async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    revalidatePath("/settings");
    return { ok: true, ...value };
  } catch {
    return { ok: false };
  }
}

export async function setLocale(locale: Locale): Promise<ActionResult> {
  const u = await requireUser();
  return run(async () => {
    await setLocaleLib(u.id, locale);
    return {};
  });
}

export async function setPushTime(time: string): Promise<ActionResult> {
  const u = await requireUser();
  return run(async () => {
    await setPushTimeLib(u.id, time);
    return {};
  });
}

export async function regenerateCalendarToken(): Promise<ActionResult<{ url: string }>> {
  const u = await requireUser();
  return run(async () => ({ url: calendarUrl(env.APP_URL, await regenerateLib(u.id)) }));
}
