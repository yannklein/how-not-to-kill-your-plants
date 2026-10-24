import { afterEach, describe, expect, it, vi } from "vitest";

describe("signedUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(publicEndpoint: string | undefined) {
    vi.resetModules();
    vi.stubEnv("S3_ENDPOINT", "http://minio:9000");
    vi.stubEnv("S3_PUBLIC_ENDPOINT", publicEndpoint ?? "");
    vi.stubEnv("S3_BUCKET", "plants");
    vi.stubEnv("S3_ACCESS_KEY", "k");
    vi.stubEnv("S3_SECRET_KEY", "s");
    for (const [k, v] of Object.entries({
      DATABASE_URL: "postgres://x",
      BETTER_AUTH_SECRET: "x",
      BETTER_AUTH_URL: "http://x",
      AI_MODE: "mock",
      VAPID_PUBLIC_KEY: "x",
      VAPID_PRIVATE_KEY: "x",
      VAPID_SUBJECT: "mailto:x@x.x",
      CRON_SECRET: "x",
      APP_URL: "http://x",
    })) vi.stubEnv(k, v);
    return import("@/lib/storage");
  }

  it("presigns against S3_PUBLIC_ENDPOINT when set", async () => {
    const { signedUrl } = await load("https://files.example.com");
    expect(new URL(await signedUrl("photos/a.jpg")).origin).toBe("https://files.example.com");
  });

  it("falls back to S3_ENDPOINT when unset", async () => {
    const { signedUrl } = await load(undefined);
    expect(new URL(await signedUrl("photos/a.jpg")).origin).toBe("http://minio:9000");
  });
});
