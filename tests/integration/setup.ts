import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { db } from "@/db/client";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://plants:plants@localhost:5433/plants_test";

export { db };

// Vitest globalSetup hook: fresh schema + migrations, once per run.
export async function setup(): Promise<void> {
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await admin.unsafe("CREATE SCHEMA public");
  } finally {
    await admin.end();
  }
  await runMigrations(url);
}

const tableNames = Object.values(schema)
  .filter((v) => is(v, PgTable))
  .map((t) => getTableName(t as PgTable));

export async function resetDb(): Promise<void> {
  const list = tableNames.map((n) => `"${n}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

