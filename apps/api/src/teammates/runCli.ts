// `pnpm --filter @workbench/api teammate:run`: run one step of the invented AI
// teammate with the stub provider against the database at DATABASE_URL
// (default apps/api/data/workbench.db, seeded with `db:seed`). For the demo;
// it calls no model.
import { defaultDatabaseUrl, openDb } from "../db/client.ts";
import { runTeammate } from "./runner.ts";
import { stubProvider } from "./stubProvider.ts";

const teammateId = process.env.TEAMMATE_ID ?? "invented-ai";
const db = await openDb(defaultDatabaseUrl);
const run = await runTeammate(db, { teammateId, provider: stubProvider });
if (!run) {
  console.log(`${teammateId}: no card it may pick.`);
} else {
  console.log(`${teammateId} worked ${run.card.id} (${run.card.title}):`);
  for (const e of run.events) console.log(`  ${e.type}${e.type === "status_changed" ? ` -> ${e.to.state}` : ""}`);
}
