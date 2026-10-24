import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV, E2E_PORT } from "./e2e/seed-data";

// The e2e suite runs against its own database (plants_e2e on the db-test
// Postgres, port 5433), created, migrated and seeded by e2e/global-setup.ts.
// The app runs on its own port so a developer's `next dev` on :3000 (with the
// real database) is never reused by mistake.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: E2E_BASE_URL,
    ...devices["iPhone 14"],
  },
  webServer: {
    command: `npx next dev --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...E2E_ENV, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
