// Known accounts seeded into the e2e database by global-setup.ts.
export const E2E_DB_NAME = "plants_e2e";
export const E2E_ADMIN_URL = "postgres://plants:plants@localhost:5433/postgres";
export const E2E_DATABASE_URL = `postgres://plants:plants@localhost:5433/${E2E_DB_NAME}`;
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const USERS = {
  Y: { name: "Yann", email: "yann@e2e.test", password: "e2e-password-yann", role: "admin" },
  A: { name: "Adriana", email: "adriana@e2e.test", password: "e2e-password-adriana", role: "user" },
  M: { name: "Marcela", email: "marcela@e2e.test", password: "e2e-password-marcela", role: "user" },
} as const;
export type UserKey = keyof typeof USERS;

// Group names: YA = {Y, A}, M = {M}, Everyone = {Y, A, M}.
export const GROUPS = { YA: "Yann & Adriana", M: "Marcela", ALL: "Everyone" } as const;
export const SPOT_NAME = "Living room window";

/** Env the app server (and global setup) run with. */
export const E2E_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  BETTER_AUTH_SECRET: "k3J9xQ7vLm2Zp8WnR4tYb6HdFs1CgA5u",
  BETTER_AUTH_URL: E2E_BASE_URL,
  APP_URL: E2E_BASE_URL,
  AI_MODE: "mock",
  NEXT_DIST_DIR: ".next-e2e",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "plants",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio-secret",
  VAPID_PUBLIC_KEY: "BHaR0MpyuOp_kRK24mT_Xcqwn40gvbrD7XPV1iNzoqrGz1xzfDXv08UvpFIG4j6D0T9u8RvS-Ux4puUTbkePQxc",
  VAPID_PRIVATE_KEY: "BYo3G-ulOd0TWrQ4JXQjLpicGkx-90IjDCk1HREoErE",
  VAPID_SUBJECT: "mailto:e2e@example.com",
  CRON_SECRET: "e2e",
} as const;
