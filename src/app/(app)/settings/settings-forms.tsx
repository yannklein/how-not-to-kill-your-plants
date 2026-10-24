"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/locales";
import { authClient } from "@/lib/auth-client";
import { regenerateCalendarToken, setLocale, setPushTime, type ActionResult } from "./actions";

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "pt-BR", label: "Português (Brasil)" },
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function useSave() {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  function save(fn: () => Promise<ActionResult>) {
    setStatus("idle");
    start(async () => setStatus((await fn()).ok ? "saved" : "error"));
  }
  return { pending, status, save };
}

export function LanguageForm({ initial }: { initial: Locale }) {
  const t = useTranslations("settings");
  const { pending, status, save } = useSave();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="language">{t("language")}</Label>
      <select
        id="language"
        className={selectClass}
        defaultValue={initial}
        disabled={pending}
        onChange={(e) => save(() => setLocale(e.target.value as Locale))}
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      {status === "saved" && <p className="text-sm text-muted-foreground">{t("saved")}</p>}
    </div>
  );
}

export function PushTimeForm({ initial }: { initial: string }) {
  const t = useTranslations("settings");
  const { pending, status, save } = useSave();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="push-time">{t("pushTime")}</Label>
      <Input
        id="push-time"
        type="time"
        defaultValue={initial}
        disabled={pending}
        onChange={(e) => e.target.value && save(() => setPushTime(e.target.value))}
      />
      {status === "saved" && <p className="text-sm text-muted-foreground">{t("saved")}</p>}
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t("admin.error")}
        </p>
      )}
    </div>
  );
}

export function CalendarSection({ initialUrl }: { initialUrl: string }) {
  const t = useTranslations("calendar");
  const ts = useTranslations("settings");
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="calendar-url">{t("feedUrl")}</Label>
      <Input id="calendar-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
        <a href={url.replace(/^https?:\/\//, "webcal://")} className={buttonVariants({ variant: "outline" })}>
          {t("addToApple")}
        </a>
      </div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("regenerateConfirm"))) return;
          start(async () => {
            const r = await regenerateCalendarToken();
            setFailed(!r.ok);
            if (r.ok) {
              setUrl(r.url);
              setCopied(false);
            }
          });
        }}
      >
        {t("regenerate")}
      </Button>
      <p className="text-sm text-muted-foreground">{t("regenerateWarning")}</p>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {ts("admin.error")}
        </p>
      )}
    </div>
  );
}

export function SignOutButton() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [pending, start] = useTransition();
  function signOut() {
    start(async () => {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    });
  }
  return (
    <Button type="button" variant="outline" className="h-11 text-base" disabled={pending} onClick={signOut}>
      {t("signOut")}
    </Button>
  );
}
