import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

// CLI entry: `npm run db:migrate`, or `node dist/migrate.js` in the container
// (esbuild bundle; runs from the app root so ./drizzle resolves).
if (/migrate\.(ts|js)$/.test(process.argv[1] ?? "")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  runMigrations(url).then(
    () => console.log("migrations applied"),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
