"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePlantAction, type EditState } from "./actions";

type Option = { id: string; name: string };

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function EditPlantForm({
  plantId,
  groups,
  spots,
  initial,
}: {
  plantId: string;
  groups: Option[];
  spots: Option[];
  initial: {
    name: string;
    groupId: string;
    spotId: string;
    status: "alive" | "dead" | "given_away";
    waterIntervalOverrideDays: string;
    potSizeCm: string;
    personaSummary: string;
    personaTraits: string;
  };
}) {
  const t = useTranslations("plants");
  const ta = useTranslations("addPlant");
  const [state, action, pending] = useActionState<EditState, FormData>(
    updatePlantAction.bind(null, plantId),
    { error: false },
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{ta("nameLabel")}</Label>
        <Input id="name" name="name" required maxLength={100} defaultValue={initial.name} className="h-11 text-base" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="groupId">{ta("groupLabel")}</Label>
        <select id="groupId" name="groupId" defaultValue={initial.groupId} className={selectClass}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spotId">{ta("spotLabel")}</Label>
        <select id="spotId" name="spotId" defaultValue={initial.spotId} className={selectClass}>
          <option value="">{ta("spotNone")}</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">{t("status.label")}</Label>
        <select id="status" name="status" defaultValue={initial.status} className={selectClass}>
          <option value="alive">{t("status.alive")}</option>
          <option value="dead">{t("status.dead")}</option>
          <option value="given_away">{t("status.given_away")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waterIntervalOverrideDays">{t("waterOverrideLabel")}</Label>
        <Input
          id="waterIntervalOverrideDays"
          name="waterIntervalOverrideDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          defaultValue={initial.waterIntervalOverrideDays}
          placeholder={t("waterOverridePlaceholder")}
          className="h-11 text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="potSizeCm">{ta("potSizeLabel")}</Label>
        <Input
          id="potSizeCm"
          name="potSizeCm"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          defaultValue={initial.potSizeCm}
          className="h-11 text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="personaSummary">{t("personality")}</Label>
        <textarea
          id="personaSummary"
          name="personaSummary"
          maxLength={300}
          rows={3}
          defaultValue={initial.personaSummary}
          className="rounded-md border bg-transparent px-3 py-2 text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="personaTraits">{t("traits")}</Label>
        <Input
          id="personaTraits"
          name="personaTraits"
          defaultValue={initial.personaTraits}
          className="h-11 text-base"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("saveError")}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-11 text-base">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
