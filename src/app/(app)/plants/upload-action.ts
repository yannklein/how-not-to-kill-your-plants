"use server";

import { requireUser } from "@/lib/session";
import { PhotoError, storeDraftPhoto, type PhotoErrorCode } from "@/lib/photos";

export type UploadDraftPhotoResult =
  | { ok: true; key: string; url: string; width: number; height: number }
  | { ok: false; error: PhotoErrorCode };

export async function uploadDraftPhoto(
  formData: FormData,
): Promise<UploadDraftPhotoResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "bad_type" };
  try {
    const stored = await storeDraftPhoto(user.id, {
      bytes: Buffer.from(await file.arrayBuffer()),
      type: file.type,
      width: Number(formData.get("width")) || 0,
      height: Number(formData.get("height")) || 0,
    });
    return { ok: true, ...stored };
  } catch (e) {
    if (e instanceof PhotoError) return { ok: false, error: e.code };
    throw e;
  }
}
