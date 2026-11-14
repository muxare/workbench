// A real team's board, started from files checked in under teams/<team>/ rather
// than from the invented seed. `team.json` names the people (with their roles),
// the AI teammate and the running cycle; `cards.json` lists the cards to enter.
// The board's database is teams/<team>/board.db, ignored by git, so it is never
// confused with the scratch database under apps/api/data that the invented seed
// fills. Everything goes through the store, as the seed and the HTTP API do:
// people join through `addTeammate`, cards are added through `addCard`.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cycle, sameTeamName, type TeamName } from "@workbench/shared";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import {
  addCard,
  addCycle,
  addTeammate,
  appendEvent,
  cardRecord,
  getCard,
  getTeammate,
  listTeammates,
  StoreError,
  teammateRecord,
  teamName,
} from "../store.ts";

/** The repository root; team directories on the command line are relative to it. */
export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * A team file. `github_logins` says which teammate each GitHub account is, so
 * the webhook endpoint can name the actor of what happens on GitHub; it is
 * kept here rather than on the teammate, because it is configuration of one
 * workspace, not part of who the person is on the board.
 */
export const teamFile = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "expected a lower-case team id"),
    name: z.string().min(1),
    headline: z.string().min(1).optional(),
    teammates: z.array(teammateRecord).min(1),
    cycle,
    github_logins: z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/, "expected a GitHub login"), z.string().min(1)).optional(),
  })
  .refine((t) => Object.values(t.github_logins ?? {}).every((id) => t.teammates.some((m) => m.id === id)), {
    message: "github_logins maps an account to someone who is not a teammate",
    path: ["github_logins"],
  });
export type TeamFile = z.infer<typeof teamFile>;

export const cardsFile = z.strictObject({ cards: z.array(cardRecord) });
export type CardsFile = z.infer<typeof cardsFile>;

/** The team directory for a command-line argument, resolved from the repository root. */
export function teamDir(arg: string): string {
  return resolve(repoRoot, arg);
}

/** Where a team's board lives: `board.db` in its directory. */
export function boardDatabasePath(dir: string): string {
  return join(dir, "board.db");
}

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  if (!existsSync(path)) throw new Error(`${path} does not exist`);
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const readTeamFile = (dir: string): TeamFile => readJson(join(dir, "team.json"), teamFile);
export const readCardsFile = (dir: string): CardsFile => readJson(join(dir, "cards.json"), cardsFile);

/**
 * Put a team on an empty database: each teammate joins at `joinedAt` (a person
 * through their joining `roles_changed` event, the only events this writes),
 * and the team's cycle is added. Refuses a database that already has teammates.
 */
export async function startTeam(db: Db, team: TeamFile, joinedAt: string): Promise<void> {
  if ((await listTeammates(db)).length > 0) {
    throw new StoreError("the database already holds a team; start a board only on a new database", "conflict");
  }
  for (const t of team.teammates) await addTeammate(db, t, joinedAt);
  await addCycle(db, team.cycle);
  await nameTeam(db, team, joinedAt);
}

/** The name and headline a team file gives its board. */
export function teamNameOf(team: TeamFile): TeamName {
  return team.headline === undefined ? { name: team.name } : { name: team.name, headline: team.headline };
}

/**
 * Give the board the name and headline in the team file, through a
 * `team_named` event, when the board does not have them yet. The change is
 * recorded as made by the file's first person, because a person edits the
 * team file and the event must have a human actor. Returns whether it named
 * the board.
 */
export async function nameTeam(db: Db, team: TeamFile, at: string): Promise<boolean> {
  const current = await teamName(db);
  const to = teamNameOf(team);
  if (sameTeamName(current, to)) return false;
  const person = team.teammates.find((t) => t.kind === "human");
  if (!person) throw new StoreError("a team file needs a person to name the board", "rule_violation");
  await appendEvent(db, { id: `team-named-${at}`, type: "team_named", actor: person.id, at, from: current, to });
  return true;
}

/**
 * Enter cards on a started board, in file order, each in `backlog`. A card
 * already on the board with the same id, title and function is skipped, so
 * the file can be entered again after cards are added to it. A card whose id
 * is taken by a different card is refused: `POST /cards` numbers cards from
 * the same pool, so the API may have used the id first. Checks what `POST /cards` checks: the
 * function exists in process/ (`functionIds`), the owner is a teammate, and
 * every `depends_on` card exists, earlier in the file or already on the board.
 */
export async function enterCards(
  db: Db,
  file: CardsFile,
  functionIds: ReadonlySet<string>,
): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const c of file.cards) {
    const existing = await getCard(db, c.id);
    if (existing) {
      if (existing.title !== c.title || existing.function_id !== c.function_id) {
        throw new StoreError(
          `${c.id}: the board already has a different card '${c.id}' ("${existing.title}", ${existing.function_id}); ` +
            `cards made through the API take the next number too, so give this card a free id`,
          "conflict",
        );
      }
      skipped.push(c.id);
      continue;
    }
    if (!(await getTeammate(db, c.owner))) throw new StoreError(`${c.id}: owner '${c.owner}' is not a teammate`, "rule_violation");
    for (const link of c.links) {
      if (!(await getCard(db, link.card_id))) {
        throw new StoreError(`${c.id}: depends on '${link.card_id}', which is not on the board`, "rule_violation");
      }
    }
    await addCard(db, c, functionIds);
    added.push(c.id);
  }
  return { added, skipped };
}
