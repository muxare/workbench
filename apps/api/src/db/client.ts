// Opens the SQLite database through libSQL and Drizzle and applies the
// migrations in ./migrations (generated from schema.ts by drizzle-kit).
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.ts";

export type Db = LibSQLDatabase<typeof schema>;

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/** The URL used when DATABASE_URL is unset: a file under apps/api/data. */
export const fallbackDatabaseUrl = "file:data/workbench.db";

/**
 * The database URL from DATABASE_URL, or the fallback. Read when called, not
 * when this module loads: `team:serve` sets DATABASE_URL in its body, after
 * its imports (and this module with them) have already been evaluated.
 */
export function defaultDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? fallbackDatabaseUrl;
}

/**
 * Open a database and bring its tables up to date. `:memory:` gives a fresh,
 * empty database, which is what the tests use.
 */
export async function openDb(url: string = defaultDatabaseUrl()): Promise<Db> {
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}
