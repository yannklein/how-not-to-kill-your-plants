"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import { addPlantPhotoAction } from "@/app/(app)/plants/[id]/actions";
import { uploadDraftPhoto } from "@/app/(app)/plants/upload-action";
import { buttonVariants } from "@/components/ui/button";
import type { MomentType } from "@/lib/feed/types";
import { downscaleImage } from "@/lib/image/downscale";
import { cn } from "@/lib/utils";
import { MomentPicker } from "./moment-picker";

/** Take a portrait of a plant, then say in one tap whether anything is new. */
export function PhotoCapture({ plantId, label, variant = "default" }: { plantId: string; label: string; variant?: "default" | "outline" }) {
  const t = useTranslations();
  const router = useRouter();
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { blob, width, height } = await downscaleImage(file);
      const form = new FormData();
      form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      form.set("width", String(width));
      form.set("height", String(height));
      const uploaded = await uploadDraftPhoto(form);
      if (!uploaded.ok) {
        toast.error(uploaded.error === "too_large" ? t("addPlant.photoTooLarge") : t("addPlant.photoBadType"));
        return;
      }
      setDraftKey(uploaded.key);
    } catch (err) {
      console.error(err);
      toast.error(t("common.error"));
    } finally {
      setUploading(false);
    }
  }

  function save(moment: MomentType | null) {
    if (!draftKey) return;
    startSaving(async () => {
      try {
        await addPlantPhotoAction(plantId, draftKey, moment);
        setDraftKey(null);
        router.refresh();
      } catch (err) {
        console.error(err);
        toast.error(t("common.error"));
      }
    });
  }

  if (draftKey) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("feed.anythingNew")}</p>
        <MomentPicker withNothing disabled={saving} onPick={save} />
      </div>
    );
  }
  return (
    <label
      className={cn(
        buttonVariants({ variant }),
        "h-11 flex-1 cursor-pointer text-base",
        uploading && "pointer-events-none opacity-60",
      )}
    >
      {uploading ? t("feed.uploading") : label}
      <input
        data-testid="photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={uploading}
        onChange={onFile}
      />
    </label>
  );
}
