// `pnpm --filter @workbench/api team:cycle teams/<team> ["<name>"]`: add the
// next cycle to the team's started board, teams/<team>/board.db. It starts
// where the board's last cycle ends and runs for the `length_days` of the
// `cycles` setting in teams/<team>/team.json, with the id from the setting's
// pattern. The name is the second argument, or else the setting's name
// pattern; a team that names cycles for their stage gives it every time. The
// directory is relative to the repository root.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openDb } from "../db/client.ts";
import { StoreError } from "../store.ts";
import { boardDatabasePath, readTeamFile, startNextCycle, teamDir } from "./team.ts";

const [arg, name] = process.argv.slice(2);
if (!arg) {
  console.error('usage: team:cycle teams/<team> ["<name>"]');
  process.exit(2);
}
const dir = teamDir(arg);
const team = readTeamFile(dir);
const path = boardDatabasePath(dir);
if (!existsSync(path)) {
  console.error(`${path} does not exist; start the board first with team:start ${arg}.`);
  process.exit(1);
}
const db = await openDb(pathToFileURL(path).href);
try {
  const c = await startNextCycle(db, team, name);
  console.log(`Added ${c.id} to ${path}: ${c.name} runs ${c.starts_at} to ${c.ends_at}.`);
} catch (e) {
  if (!(e instanceof StoreError)) throw e;
  console.error(e.message);
  process.exit(1);
}
