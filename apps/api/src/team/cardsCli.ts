// `pnpm --filter @workbench/api team:cards teams/<team>`: enter the cards in
// teams/<team>/cards.json on the team's started board, each in backlog. Cards
// already on the board are skipped, so it can run again after cards are added
// to the file. The directory is relative to the repository root.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openDb } from "../db/client.ts";
import { loadFunctionIds } from "../process.ts";
import { boardDatabasePath, enterCards, readCardsFile, teamDir } from "./team.ts";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: team:cards teams/<team>");
  process.exit(2);
}
const dir = teamDir(arg);
const file = readCardsFile(dir);
const path = boardDatabasePath(dir);
if (!existsSync(path)) {
  console.error(`${path} does not exist; start the board first with team:start ${arg}.`);
  process.exit(1);
}
const db = await openDb(pathToFileURL(path).href);
const { added, skipped } = await enterCards(db, file, loadFunctionIds());
console.log(`Entered ${String(added.length)} card(s) in ${path}${added.length ? `: ${added.join(", ")}` : ""}.`);
if (skipped.length) console.log(`Already on the board, skipped: ${skipped.join(", ")}.`);
