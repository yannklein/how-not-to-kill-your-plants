"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  applyAlertSuggestionAction,
  askAboutAlertAction,
  resolveAlertAction,
} from "@/app/(app)/gardener/actions";
import { Button } from "@/components/ui/button";
import type { AlertView } from "@/lib/gardener/alerts";
import { suggestionLabel } from "./suggestion-label";

/** A gardener health warning: shared by the plant's group, cleared by the first Done / Not now. */
export function AlertCard({ alert }: { alert: AlertView }) {
  const t = useTranslations("gardener");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        console.error(err);
      }
    });

  return (
    <li data-testid="alert-card" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-full bg-muted">
          {alert.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={alert.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-lg">🌿</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/plants/${alert.plantId}`} className="font-medium">
            🩺 {alert.plantName}
          </Link>
          <p className="text-sm">{alert.text}</p>
        </div>
      </div>
      {alert.suggestion ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 bg-background text-base"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await applyAlertSuggestionAction(alert.id);
              toast(r.ok ? t("applied") : r.message);
            })
          }
        >
          {suggestionLabel(t, alert.suggestion)}
        </Button>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" className="h-11 flex-1 text-base" disabled={pending} onClick={() => run(() => resolveAlertAction(alert.id, "done"))}>
          {t("done")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 bg-background text-base"
          disabled={pending}
          onClick={() => run(() => resolveAlertAction(alert.id, "dismissed"))}
        >
          {t("notNow")}
        </Button>
      </div>
      <Button type="button" variant="ghost" className="h-10" disabled={pending} onClick={() => run(() => askAboutAlertAction(alert.id))}>
        {t("askAbout")}
      </Button>
    </li>
  );
}
