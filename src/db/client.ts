import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | undefined;

function create(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(postgres(url), { schema });
}

// Lazy: no connection (or env read) happens until first use, so importing this
// module during `next build` without env does not throw.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= create();
    const value = instance[prop as keyof Db];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
