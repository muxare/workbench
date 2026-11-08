// Opens the SQLite database through libSQL and Drizzle and applies the
// migrations in ./migrations (generated from schema.ts by drizzle-kit).
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.ts";

export type Db = LibSQLDatabase<typeof schema>;

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/** The database URL from DATABASE_URL, or a file under apps/api/data. */
export const defaultDatabaseUrl = process.env.DATABASE_URL ?? "file:data/workbench.db";

/**
 * Open a database and bring its tables up to date. `:memory:` gives a fresh,
 * empty database, which is what the tests use.
 */
export async function openDb(url: string = defaultDatabaseUrl): Promise<Db> {
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}
