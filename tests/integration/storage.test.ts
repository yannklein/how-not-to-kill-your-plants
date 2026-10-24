import { describe, expect, it } from "vitest";
import { getObjectBytes, photoKey, putObject, signedUrl } from "@/lib/storage";
import { storeDraftPhoto } from "@/lib/photos";

describe("storage", () => {
  it("putObject then signedUrl fetch returns the same bytes", async () => {
    const key = photoKey("test");
    expect(key).toMatch(/^photos\/test\/[0-9a-f-]{36}\.jpg$/);
    const body = Buffer.from("hello plants");
    await putObject(key, body, "image/jpeg");
    const res = await fetch(await signedUrl(key));
    expect(res.ok).toBe(true);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(body);
    expect(await getObjectBytes(key)).toEqual(body);
  });

  it("storeDraftPhoto rejects a 5 MB jpeg with too_large", async () => {
    await expect(
      storeDraftPhoto("u1", {
        bytes: Buffer.alloc(5 * 1024 * 1024),
        type: "image/jpeg",
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow("too_large");
  });

  it("storeDraftPhoto rejects image/png with bad_type", async () => {
    await expect(
      storeDraftPhoto("u1", {
        bytes: Buffer.from("x"),
        type: "image/png",
        width: 1,
        height: 1,
      }),
    ).rejects.toThrow("bad_type");
  });

  it("storeDraftPhoto stores a jpeg under photos/draft/", async () => {
    const bytes = Buffer.from("jpegish");
    const r = await storeDraftPhoto("u1", { bytes, type: "image/jpeg", width: 4, height: 3 });
    expect(r.key).toMatch(/^photos\/draft\//);
    expect(Buffer.from(await (await fetch(r.url)).arrayBuffer())).toEqual(bytes);
  });
});
