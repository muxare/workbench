// `pnpm --filter @workbench/api team:start teams/<team>`: create the team's
// board database, teams/<team>/board.db, with the people and AI teammate from
// teams/<team>/team.json and its cycle. No cards and no events beyond each
// person's joining event. Refuses if the database already exists. The
// directory is relative to the repository root.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openDb } from "../db/client.ts";
import { boardDatabasePath, readTeamFile, startTeam, teamDir } from "./team.ts";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: team:start teams/<team>");
  process.exit(2);
}
const dir = teamDir(arg);
const team = readTeamFile(dir);
const path = boardDatabasePath(dir);
if (existsSync(path)) {
  console.error(`${path} already exists; the board has been started. Delete it only if you mean to lose its events.`);
  process.exit(1);
}
const db = await openDb(pathToFileURL(path).href);
await startTeam(db, team, new Date().toISOString());
console.log(`Started ${team.name}'s board in ${path}: ${team.teammates.map((t) => t.name).join(", ")}; ${team.cycle.name} runs ${team.cycle.starts_at} to ${team.cycle.ends_at}.`);
