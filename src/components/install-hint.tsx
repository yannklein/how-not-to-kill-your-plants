"use client";

import { Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore, useState } from "react";

const DISMISS_KEY = "install-hint-dismissed";

function shouldShow(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && safari && !standalone && localStorage.getItem(DISMISS_KEY) !== "1";
}

const subscribe = () => () => {};

export function InstallHint() {
  const t = useTranslations("push");
  const eligible = useSyncExternalStore(subscribe, shouldShow, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!eligible || dismissed) return null;
  return (
    <aside className="m-4 mb-0 flex items-start gap-3 rounded-3xl border-[1.5px] bg-card p-4 text-sm">
      <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{t("installTitle")}</p>
        <p className="text-muted-foreground">{t("installBody")}</p>
      </div>
      <button
        type="button"
        aria-label={t("dismiss")}
        className="-m-2 p-2"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
