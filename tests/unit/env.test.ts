import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "secret-secret-secret-secret-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  ANTHROPIC_API_KEY: "sk-ant-test",
  AI_MODE: "live",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "plants",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio-secret",
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:admin@example.com",
  CRON_SECRET: "cron-secret",
  APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("throws when DATABASE_URL is missing", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow();
  });

  it("defaults AI_MODE to live", () => {
    expect(parseEnv({ ...valid, AI_MODE: undefined }).AI_MODE).toBe("live");
  });

  it("does not require ANTHROPIC_API_KEY when AI_MODE=mock", () => {
    expect(() =>
      parseEnv({ ...valid, AI_MODE: "mock", ANTHROPIC_API_KEY: undefined }),
    ).not.toThrow();
  });

  it("requires ANTHROPIC_API_KEY when AI_MODE=live", () => {
    expect(() =>
      parseEnv({ ...valid, AI_MODE: "live", ANTHROPIC_API_KEY: undefined }),
    ).toThrow();
  });
});
