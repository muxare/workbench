// `pnpm --filter @workbench/api team:serve teams/<team>`: run the API on the
// team's board, teams/<team>/board.db, made by team:start. The same server as
// `start`, with DATABASE_URL pointed at the board and TEAMMATE_ID (for the
// optional timer) at the team's AI teammate. The directory is relative to the
// repository root. The board takes its name and headline from team.json.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openDb } from "../db/client.ts";
import { formatGithubLogins } from "../github/logins.ts";
import { boardDatabasePath, nameTeam, readTeamFile, teamDir } from "./team.ts";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: team:serve teams/<team>");
  process.exit(2);
}
const dir = teamDir(arg);
const team = readTeamFile(dir);
const path = boardDatabasePath(dir);
if (!existsSync(path)) {
  console.error(`${path} does not exist; start the board first with team:start ${arg}.`);
  process.exit(1);
}
process.env.DATABASE_URL = pathToFileURL(path).href;
// A board started before team_named existed, or a team file whose name or
// headline changed since, gets the file's name now.
if (await nameTeam(await openDb(process.env.DATABASE_URL), team, new Date().toISOString())) console.log(`Named the board '${team.name}' from team.json.`);
const ai = team.teammates.find((t) => t.kind === "ai");
if (ai && process.env.TEAMMATE_ID === undefined) process.env.TEAMMATE_ID = ai.id;
// Which teammate each GitHub account is, for the webhook endpoint; an explicit GITHUB_LOGINS wins.
if (team.github_logins && process.env.GITHUB_LOGINS === undefined) process.env.GITHUB_LOGINS = formatGithubLogins(team.github_logins);
console.log(`${team.name}'s board: ${path}`);
await import("../main.ts");
