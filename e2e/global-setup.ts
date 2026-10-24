import postgres from "postgres";
import { runMigrations } from "@/db/migrate";
import { E2E_ADMIN_URL, E2E_DATABASE_URL, E2E_DB_NAME, E2E_ENV, GROUPS, SPOT_NAME, USERS } from "./seed-data";

async function ensureDatabase(): Promise<void> {
  const admin = postgres(E2E_ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${E2E_DB_NAME}`;
    if (rows.length === 0) await admin.unsafe(`create database ${E2E_DB_NAME}`);
  } finally {
    await admin.end();
  }
}

async function truncateAll(): Promise<void> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    if (tables.length) {
      const list = tables.map((t) => `"${t.tablename}"`).join(", ");
      await sql.unsafe(`truncate ${list} restart identity cascade`);
    }
  } finally {
    await sql.end();
  }
}

// Creates plants_e2e on the db-test Postgres (port 5433) if missing, migrates it,
// empties it and seeds: home, users Y/A/M, groups YA/M/Everyone and one spot.
export default async function globalSetup(): Promise<void> {
  Object.assign(process.env, E2E_ENV);
  await ensureDatabase();
  await runMigrations(E2E_DATABASE_URL);
  await truncateAll();

  // Imported late: the db client and Better Auth read env on first use.
  const { db } = await import("@/db/client");
  const { auth } = await import("@/lib/auth");
  const { group, groupMember, home, spot } = await import("@/db/schema");

  await db.insert(home).values({}); // Barcelona / N / Europe/Madrid defaults
  await db.insert(spot).values({ name: SPOT_NAME, lightLevel: "bright_indirect", windowDirection: "S" });

  const ids = {} as Record<keyof typeof USERS, string>;
  for (const key of Object.keys(USERS) as (keyof typeof USERS)[]) {
    const u = USERS[key];
    const { user } = await auth.api.createUser({
      body: { name: u.name, email: u.email, password: u.password, role: u.role },
    });
    ids[key] = user.id;
  }

  const [ya, m, all] = await db
    .insert(group)
    .values([{ name: GROUPS.YA }, { name: GROUPS.M }, { name: GROUPS.ALL }])
    .returning({ id: group.id });
  await db.insert(groupMember).values([
    { groupId: ya.id, userId: ids.Y },
    { groupId: ya.id, userId: ids.A },
    { groupId: m.id, userId: ids.M },
    { groupId: all.id, userId: ids.Y },
    { groupId: all.id, userId: ids.A },
    { groupId: all.id, userId: ids.M },
  ]);
}
