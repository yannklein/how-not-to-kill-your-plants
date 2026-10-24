"use client";

import { Camera, Loader2, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IdentifyOutcome } from "@/lib/ai/identify";
import { NOT_A_PLANT } from "@/lib/ai/schemas";
import { downscaleImage } from "@/lib/image/downscale";
import { cn } from "@/lib/utils";
import { uploadDraftPhoto } from "../upload-action";
import { createPlantAction, identifyAction } from "./actions";

type Option = { id: string; name: string };
type DraftPhoto = { key: string; previewUrl: string };
type Phase = "photo" | "working" | "confirm";
type Selected = number | "other";

const LAST_GROUP_KEY = "lastGroupId";

function defaultGroupId(groups: Option[]): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LAST_GROUP_KEY);
  } catch {
    // localStorage can be unavailable (private mode); fall through to the first group.
  }
  return groups.find((g) => g.id === stored)?.id ?? groups[0]?.id ?? "";
}

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function AddPlantForm({ groups, spots }: { groups: Option[]; spots: Option[] }) {
  const t = useTranslations("addPlant");
  const router = useRouter();

  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [phase, setPhase] = useState<Phase>("photo");
  const [workingLabel, setWorkingLabel] = useState<"uploading" | "identifying">("uploading");
  const [result, setResult] = useState<IdentifyOutcome | null>(null);
  const [selected, setSelected] = useState<Selected>(0);
  const [otherSpecies, setOtherSpecies] = useState("");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [spotId, setSpotId] = useState("");
  const [justBought, setJustBought] = useState(true);
  const [potSize, setPotSize] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0); // ignores results of superseded uploads/identifications
  const photosRef = useRef<DraftPhoto[]>([]);
  const resultRef = useRef<IdentifyOutcome | null>(null);

  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)),
    [],
  );

  async function onFile(slot: "photo" | "label", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const mine = ++run.current;
    setError(null);
    setWorkingLabel("uploading");
    setPhase("working");
    try {
      const { blob, width, height } = await downscaleImage(file);
      const form = new FormData();
      form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      form.set("width", String(width));
      form.set("height", String(height));
      const uploaded = await uploadDraftPhoto(form);
      if (mine !== run.current) return;
      if (!uploaded.ok) {
        setError(uploaded.error === "too_large" ? t("photoTooLarge") : t("photoBadType"));
        setPhase(photosRef.current.length ? "confirm" : "photo");
        return;
      }
      const draft = { key: uploaded.key, previewUrl: URL.createObjectURL(blob) };
      const next = [...photosRef.current];
      const index = slot === "photo" || next.length === 0 ? 0 : 1;
      if (next[index]) URL.revokeObjectURL(next[index].previewUrl);
      next[index] = draft;
      photosRef.current = next;
      setPhotos(next);

      setWorkingLabel("identifying");
      const identified = await identifyAction(next.map((p) => p.key));
      if (mine !== run.current) return;
      applyIdentification(identified);
    } catch (err) {
      console.error(err);
      if (mine !== run.current) return;
      if (photosRef.current.length && !resultRef.current) {
        // Photo is uploaded but identification threw: let the user type the species.
        applyIdentification({ ...NOT_A_PLANT, failure: "error" });
        return;
      }
      setError(t("error"));
      setPhase(photosRef.current.length ? "confirm" : "photo");
    }
  }

  function applyIdentification(identified: IdentifyOutcome) {
    const usable = identified.isPlant && identified.candidates.length > 0;
    resultRef.current = identified;
    setResult(identified);
    setSelected(usable ? 0 : "other");
    setName(identified.suggestedNames[0] ?? "");
    setPotSize(identified.potSizeCm ? String(Math.round(identified.potSizeCm)) : "");
    setGroupId((current) => current || defaultGroupId(groups));
    setPhase("confirm");
  }

  const candidates = result?.isPlant ? result.candidates : [];
  const species =
    selected === "other"
      ? { scientificName: otherSpecies.trim(), commonName: otherSpecies.trim() }
      : (candidates[selected] ?? { scientificName: "", commonName: "" });
  const canSave = !saving && !!species.scientificName && !!groupId;

  async function onSave() {
    if (!canSave || !result) return;
    setSaving(true);
    setError(null);
    try {
      const pot = Number.parseInt(potSize, 10);
      const { plantId } = await createPlantAction({
        photoKeys: photos.map((p) => p.key),
        scientificName: species.scientificName,
        commonName: species.commonName,
        name: name.trim() || species.scientificName,
        persona: result.isPlant && result.persona.summary ? result.persona : null,
        groupId,
        spotId: spotId || null,
        justBought,
        potSizeCm: Number.isFinite(pot) && pot > 0 ? pot : null,
      });
      try {
        localStorage.setItem(LAST_GROUP_KEY, groupId);
      } catch {
        // Remembering the group is a convenience only.
      }
      router.push(`/plants/${plantId}`);
    } catch (err) {
      console.error(err);
      setError(t("error"));
      setSaving(false);
    }
  }

  const pickerClass = cn(
    buttonVariants({ variant: "default", size: "lg" }),
    "h-14 flex-1 cursor-pointer text-base has-[:focus-visible]:ring-3",
  );
  const labelClass = cn(
    buttonVariants({ variant: "outline", size: "lg" }),
    "h-11 cursor-pointer has-[:focus-visible]:ring-3",
  );
  const busy = phase === "working";

  return (
    <div className="flex flex-col gap-4">
      {photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimizable
        <img
          src={photos[0].previewUrl}
          alt=""
          data-testid="photo-preview"
          className="max-h-72 w-full rounded-xl object-contain bg-muted"
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <label className={pickerClass} aria-disabled={busy}>
            <Camera aria-hidden />
            {photos.length ? t("retakePhoto") : t("takePhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              data-testid="photo-input"
              disabled={busy}
              onChange={(e) => onFile("photo", e)}
            />
          </label>
        </div>
        <label className={labelClass} aria-disabled={busy}>
          <Tag aria-hidden />
          {t("addLabelPhoto")}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            data-testid="label-input"
            disabled={busy}
            onChange={(e) => onFile("label", e)}
          />
        </label>
      </div>

      {busy && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {workingLabel === "uploading" ? t("uploading") : t("identifying")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {phase === "confirm" && result && (
        <div className="flex flex-col gap-4" data-testid="confirm-step">
          {candidates.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              {result.failure ? t("identifyFailed") : t("notPlant")}
            </p>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("speciesLabel")}</legend>
            <div role="radiogroup" aria-label={t("speciesLabel")} className="flex flex-col gap-2">
              {candidates.map((c, i) => (
                <button
                  key={c.scientificName}
                  type="button"
                  role="radio"
                  aria-checked={selected === i}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex min-h-11 flex-col items-start rounded-lg border px-3 py-2 text-left",
                    selected === i ? "border-primary bg-primary/10" : "border-input",
                  )}
                >
                  <span className="font-medium">{c.scientificName}</span>
                  <span className="text-sm text-muted-foreground">
                    {c.commonName} · {Math.round(c.confidence * 100)}%
                  </span>
                </button>
              ))}
              {candidates.length > 0 && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === "other"}
                  onClick={() => setSelected("other")}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left",
                    selected === "other" ? "border-primary bg-primary/10" : "border-input",
                  )}
                >
                  {t("somethingElse")}
                </button>
              )}
            </div>
            {selected === "other" && (
              <Input
                aria-label={t("speciesInputLabel")}
                placeholder={t("speciesPlaceholder")}
                className="h-11 text-base"
                value={otherSpecies}
                onChange={(e) => setOtherSpecies(e.target.value)}
              />
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plant-name">{t("nameLabel")}</Label>
            <Input
              id="plant-name"
              className="h-11 text-base"
              value={name}
              placeholder={species.scientificName}
              onChange={(e) => setName(e.target.value)}
            />
            {result.suggestedNames.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {result.suggestedNames.slice(1).map((n) => (
                  <Button key={n} type="button" variant="outline" className="h-9" onClick={() => setName(n)}>
                    {n}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {groups.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="plant-group">{t("groupLabel")}</Label>
              <select
                id="plant-group"
                className={fieldClass}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {spots.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="plant-spot">{t("spotLabel")}</Label>
              <select
                id="plant-spot"
                className={fieldClass}
                value={spotId}
                onChange={(e) => setSpotId(e.target.value)}
              >
                <option value="">{t("spotNone")}</option>
                {spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex min-h-11 items-center justify-between">
            <span id="just-bought-label" className="text-sm font-medium">
              {t("justBought")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={justBought}
              aria-labelledby="just-bought-label"
              onClick={() => setJustBought((v) => !v)}
              className={cn(
                "relative h-7 w-12 rounded-full transition-colors",
                justBought ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-6 rounded-full bg-background transition-transform",
                  justBought && "translate-x-5",
                )}
              />
              <span className="sr-only">{justBought ? t("yes") : t("no")}</span>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plant-pot">{t("potSizeLabel")}</Label>
            <Input
              id="plant-pot"
              type="number"
              inputMode="numeric"
              min={1}
              className="h-11 text-base"
              value={potSize}
              onChange={(e) => setPotSize(e.target.value)}
            />
          </div>

          <Button type="button" size="lg" className="h-12 text-base" disabled={!canSave} onClick={onSave}>
            {saving ? t("saving") : t("confirmSave")}
          </Button>
        </div>
      )}
    </div>
  );
}
