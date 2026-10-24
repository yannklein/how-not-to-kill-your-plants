"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMomentAction, logMomentAction } from "@/app/(app)/plants/[id]/actions";
import { Button } from "@/components/ui/button";
import type { MomentType } from "@/lib/feed/types";
import { MomentPicker } from "./moment-picker";

type Moment = { id: string; type: MomentType; userName: string; mine: boolean; when: string };

/** "Something new? 🌱" plus the plant's latest moments; only the author can delete one. */
export function PlantMoments({ plantId, moments }: { plantId: string; moments: Moment[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<void>) =>
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        console.error(err);
        toast.error(t("common.error"));
      }
    });

  return (
    <section className="flex flex-col gap-2">
      {open ? (
        <MomentPicker
          disabled={pending}
          onPick={(m) =>
            m &&
            run(async () => {
              await logMomentAction(plantId, m);
              setOpen(false);
            })
          }
        />
      ) : (
        <Button type="button" variant="outline" className="h-11 text-base" onClick={() => setOpen(true)}>
          {t("plants.somethingNew")}
        </Button>
      )}
      {moments.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {moments.map((m) => (
            <li key={m.id} data-testid="moment" className="flex items-center justify-between gap-2 text-sm">
              <span>
                {t(`feed.moments.${m.type}`)} · <span className="text-muted-foreground">{m.userName}, {m.when}</span>
              </span>
              {m.mine ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("plants.deleteMoment")}
                  disabled={pending}
                  onClick={() => run(() => deleteMomentAction(plantId, m.id))}
                >
                  ✕
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
