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
