"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DiscoverCardView } from "@/components/discover-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DiscoverCard, DiscoverInput, Effort, Want, WindowDirection } from "@/lib/discover/types";
import { runDiscoverAction, saveWishAction } from "./actions";

const selectClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base";
const DIRECTIONS: WindowDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const NEW = "__new";

export function DiscoverForm({
  spots,
  last,
  savedNames,
  paused,
}: {
  spots: { id: string; name: string }[];
  last: { input: DiscoverInput; cards: DiscoverCard[] } | null;
  savedNames: string[];
  paused: boolean;
}) {
  const t = useTranslations("discover");
  const router = useRouter();
  const [spotChoice, setSpotChoice] = useState(last?.input.spotId ?? spots[0]?.id ?? NEW);
  const [direction, setDirection] = useState<WindowDirection>(last?.input.newSpot?.windowDirection ?? "S");
  const [distance, setDistance] = useState<"close" | "middle" | "far">(last?.input.newSpot?.distance ?? "middle");
  const [effort, setEffort] = useState<Effort>(last?.input.effort ?? "easy");
  const [wants, setWants] = useState<Want[]>(last?.input.wants ?? ["looks"]);
  const [style, setStyle] = useState(last?.input.style ?? "");
  const [saved, setSaved] = useState<string[]>(savedNames);
  const [searching, startSearch] = useTransition();

  const toggle = (w: Want) => setWants((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  function search() {
    const input: DiscoverInput = {
      spotId: spotChoice === NEW ? null : spotChoice,
      newSpot: spotChoice === NEW ? { windowDirection: direction, distance } : null,
      effort,
      wants,
      style: style.trim(),
    };
    startSearch(async () => {
      const status = await runDiscoverAction(input);
      if (status === "paused") toast(t("paused"));
      if (status === "error") toast.error(t("error"));
      router.refresh();
    });
  }

  async function save(card: DiscoverCard) {
    await saveWishAction(card);
    setSaved((s) => [...s, card.scientificName]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spot">{t("spot")}</Label>
        <select id="spot" className={selectClass} value={spotChoice} onChange={(e) => setSpotChoice(e.target.value)}>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW}>{t("newSpot")}</option>
        </select>
      </div>
      {spotChoice === NEW ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="direction">{t("windowFaces")}</Label>
            <select id="direction" className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as WindowDirection)}>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="distance">{t("distance")}</Label>
            <select id="distance" className={selectClass} value={distance} onChange={(e) => setDistance(e.target.value as "close" | "middle" | "far")}>
              <option value="close">{t("distanceClose")}</option>
              <option value="middle">{t("distanceMiddle")}</option>
              <option value="far">{t("distanceFar")}</option>
            </select>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="effort">{t("effort")}</Label>
        <select id="effort" className={selectClass} value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
          <option value="easy">{t("effortEasy")}</option>
          <option value="medium">{t("effortMedium")}</option>
          <option value="devoted">{t("effortDevoted")}</option>
        </select>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("wants")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["looks", "home", "edible"] as const).map((w) => (
            <Button
              key={w}
              type="button"
              variant={wants.includes(w) ? "default" : "outline"}
              className="h-10"
              aria-pressed={wants.includes(w)}
              onClick={() => toggle(w)}
            >
              {t(w === "looks" ? "wantLooks" : w === "home" ? "wantHome" : "wantEdible")}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="style">{t("style")}</Label>
        <input
          id="style"
          className={selectClass}
          maxLength={200}
          placeholder={t("stylePlaceholder")}
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        />
      </div>
      {paused ? (
        <p role="status" className="rounded-2xl bg-sunshine p-3 text-center text-sm text-sunshine-foreground">
          {t("paused")}
        </p>
      ) : (
        <Button type="button" className="h-11 text-base" disabled={searching} onClick={search}>
          {searching ? t("searching") : t("search")}
        </Button>
      )}

      {last && last.cards.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-xl">{t("results")}</h2>
          <ul className="flex flex-col gap-2">
            {last.cards.map((card) => {
              const isSaved = saved.includes(card.scientificName);
              return (
                <DiscoverCardView
                  key={card.scientificName}
                  card={card}
                  testId="discover-card"
                  actions={
                    <Button type="button" variant="outline" className="h-10 flex-1" disabled={isSaved} onClick={() => save(card)}>
                      {isSaved ? t("saved") : t("save")}
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
