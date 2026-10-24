import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
          env: {
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
            BETTER_AUTH_URL: "http://localhost:3000",
            APP_URL: "http://localhost:3000",
            S3_ENDPOINT: "http://localhost:9000",
            S3_BUCKET: "plants",
            S3_ACCESS_KEY: "minio",
            S3_SECRET_KEY: "minio-secret",
            AI_MODE: "mock",
            // dev only: never reuse in production
            VAPID_PUBLIC_KEY: "BHaR0MpyuOp_kRK24mT_Xcqwn40gvbrD7XPV1iNzoqrGz1xzfDXv08UvpFIG4j6D0T9u8RvS-Ux4puUTbkePQxc",
            VAPID_PRIVATE_KEY: "BYo3G-ulOd0TWrQ4JXQjLpicGkx-90IjDCk1HREoErE",
            VAPID_SUBJECT: "mailto:test@example.com",
            CRON_SECRET: "test",
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              "postgres://plants:plants@localhost:5433/plants_test",
            TEST_DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              "postgres://plants:plants@localhost:5433/plants_test",
          },
        },
      },
    ],
  },
});
