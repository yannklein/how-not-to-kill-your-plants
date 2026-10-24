"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Photo = { id: string; url: string; label: string };

/** The plant's portraits, newest first, and a first-vs-latest comparison. */
export function PhotoTimeline({ photos }: { photos: Photo[] }) {
  const t = useTranslations("plants");
  const [compare, setCompare] = useState(false);
  if (photos.length === 0) return null;
  const latest = photos[0];
  const first = photos[photos.length - 1];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t("photos")}</h2>
        {photos.length >= 2 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCompare((c) => !c)}>
            {compare ? t("timeline") : t("compare")}
          </Button>
        ) : null}
      </div>
      {compare ? (
        <div className="grid grid-cols-2 gap-2">
          {[first, latest].map((p, i) => (
            <figure key={p.id} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
              <figcaption className="text-xs text-muted-foreground">
                {i === 0 ? t("first") : t("latest")} · {p.label}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
          {photos.map((p) => (
            <li key={p.id} className="flex w-32 shrink-0 snap-start flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
              <span className="text-xs text-muted-foreground">{p.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
