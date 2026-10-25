"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { DiscoverCard as Card } from "@/lib/discover/types";

/** One suggested plant; `actions` holds the buttons (save / bought / remove). */
export function DiscoverCardView({ card, actions, testId }: { card: Card; actions: ReactNode; testId: string }) {
  const t = useTranslations("discover");
  const rows: [string, string | null][] = [
    [t("why"), card.whyItFits],
    [t("ease"), card.ease],
    [t("goesWith"), card.goesWith],
    [t("benefits"), card.benefits],
    [t("safety"), card.safety],
    [t("harvest"), card.harvest],
  ];
  return (
    <li data-testid={testId} className="flex flex-col gap-2 rounded-3xl border-[1.5px] bg-card p-4 text-card-foreground">
      <div>
        <p className="font-medium">{card.commonName}</p>
        <p className="text-sm italic text-muted-foreground">{card.scientificName}</p>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-medium">{label}: </dt>
              <dd className="inline">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="flex gap-2">{actions}</div>
    </li>
  );
}
