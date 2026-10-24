import { photoKey, putObject, signedUrl } from "@/lib/storage";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export const DRAFT_PREFIX = "photos/draft/";
export const MAX_PHOTOS = 2;

/** Dedupes and validates keys of uploaded draft photos (1..MAX_PHOTOS). Throws otherwise. */
export function assertDraftKeys(keys: string[]): string[] {
  const unique = [...new Set(keys)];
  if (unique.length === 0 || unique.length > MAX_PHOTOS) {
    throw new Error(`Between 1 and ${MAX_PHOTOS} photos are required`);
  }
  if (!unique.every((k) => k.startsWith(DRAFT_PREFIX) && !k.includes(".."))) {
    throw new Error("Photos must be uploaded drafts");
  }
  return unique;
}

export type PhotoErrorCode = "too_large" | "bad_type";

export class PhotoError extends Error {
  constructor(public readonly code: PhotoErrorCode) {
    super(code);
    this.name = "PhotoError";
  }
}

export type DraftPhotoInput = {
  bytes: Buffer;
  type: string;
  width: number;
  height: number;
};

// Draft keys live under photos/draft/ and stay as the photo's objectKey once
// the plant is created (no move needed).
export async function storeDraftPhoto(
  userId: string,
  file: DraftPhotoInput,
): Promise<{ key: string; url: string; width: number; height: number }> {
  void userId; // reserved for per-user quotas/audit; callers are authenticated
  if (file.type !== "image/jpeg") throw new PhotoError("bad_type");
  if (file.bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoError("too_large");
  const key = photoKey("draft");
  await putObject(key, file.bytes, "image/jpeg");
  return {
    key,
    url: await signedUrl(key),
    width: file.width,
    height: file.height,
  };
}
