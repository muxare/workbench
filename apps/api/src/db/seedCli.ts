// `pnpm --filter @workbench/api db:seed`: create the database at DATABASE_URL
// (default apps/api/data/workbench.db) and load the invented seed into it.
// Refuses to seed a database that already has teammates.
import { mkdirSync } from "node:fs";
import { loadFunctionIds } from "../process.ts";
import { inventedSeedAt } from "../seed/invented.ts";
import { listTeammates, seed } from "../store.ts";
import { defaultDatabaseUrl, openDb } from "./client.ts";

if (defaultDatabaseUrl === "file:data/workbench.db") mkdirSync("data", { recursive: true });
const db = await openDb(defaultDatabaseUrl);
if ((await listTeammates(db)).length > 0) {
  console.error(`${defaultDatabaseUrl} already holds data; delete it to seed again.`);
  process.exit(1);
}
const data = inventedSeedAt(new Date());
await seed(db, data, loadFunctionIds());
const sprint4 = data.cycles.at(-1);
console.log(`Seeded ${defaultDatabaseUrl} with invented example data; ${sprint4?.name ?? "no cycle"} runs ${sprint4?.starts_at ?? ""} to ${sprint4?.ends_at ?? ""}.`);
