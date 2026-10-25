import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PushToggle } from "@/components/push-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarUrl, getOrCreateCalendarToken } from "@/lib/calendar/tokens";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { CalendarSection, LanguageForm, PushTimeForm, SignOutButton } from "./settings-forms";

export default async function SettingsPage() {
  const me = await requireUser();
  const t = await getTranslations("settings");
  const url = calendarUrl(env.APP_URL, await getOrCreateCalendarToken(me.id));

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageForm initial={me.locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PushTimeForm initial={me.pushTime} />
          <PushToggle vapidPublicKey={env.VAPID_PUBLIC_KEY} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{(await getTranslations("calendar"))("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarSection initialUrl={url} />
        </CardContent>
      </Card>

      <SignOutButton />

      {me.role === "admin" && (
        <Link href="/settings/admin" className="text-base font-medium underline underline-offset-4">
          {t("admin.title")}
        </Link>
      )}
    </main>
  );
}
