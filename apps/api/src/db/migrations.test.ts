// Migrations on databases made before them. 0002: card events keep their
// card, and each stored process profile becomes mode_changed events. 0004:
// each stored role becomes a roles_changed event. All example data here is
// invented.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { boardLog, cardLog, getTeammate } from "../store.ts";
import { openDb } from "./client.ts";

const migrations = fileURLToPath(new URL("./migrations", import.meta.url));
let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** A database file brought up to the migration before `tag` only, with `rows` inserted. */
async function databaseBefore(tag: string, rows: string[]): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), "workbench-migration-"));
  const old = join(dir, "migrations");
  cpSync(migrations, old, { recursive: true });
  const journalPath = join(old, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < tag);
  writeFileSync(journalPath, JSON.stringify(journal));
  const url = `file:${join(dir, "old.db")}`;
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: old });
  await client.batch(rows);
  client.close();
  return url;
}

/** A database file brought up to migration 0001 only, as it stood before teammate events. */
function databaseBefore0002(): Promise<string> {
  return databaseBefore("0002", [
    `INSERT INTO teammates (id, kind, name, role, process_profile) VALUES ('h', 'human', 'Invented human', 'ux', '{"frame_problem":"assist","write_issues":"delegate"}')`,
    `INSERT INTO teammates (id, kind, name, role, process_profile) VALUES ('a', 'ai', 'Invented AI', NULL, NULL)`,
    `INSERT INTO cards (id, title, function_id, owner, links) VALUES ('k', 'Invented card', 'frame_problem', 'h', '[]')`,
    `INSERT INTO events (id, card_id, type, actor, at, at_ms, payload) VALUES ('e1', 'k', 'status_changed', 'h', '2026-11-01T09:00:00Z', 1793523600000, '{"from":"backlog","to":{"state":"ready"}}')`,
  ]);
}

describe("migration 0004_teammate_roles_events", () => {
  it("turns each person's stored role into a roles_changed event and drops the column", async () => {
    const db = await openDb(
      await databaseBefore("0004", [
        `INSERT INTO teammates (id, kind, name, role) VALUES ('h', 'human', 'Invented human', 'be')`,
        `INSERT INTO teammates (id, kind, name, role) VALUES ('a', 'ai', 'Invented AI', NULL)`,
      ]),
    );
    expect(await getTeammate(db, "h")).toEqual({ kind: "human", id: "h", name: "Invented human", roles: ["be"], process_profile: {} });
    expect(await getTeammate(db, "a")).toEqual({ kind: "ai", id: "a", name: "Invented AI" });
    expect(await boardLog(db)).toEqual([
      expect.objectContaining({ id: "migrated-roles-h", type: "roles_changed", teammate_id: "h", actor: "h", from: [], to: ["be"] }),
    ]);
  });
});

describe("migration 0002_teammate_events", () => {
  it("keeps card events on their card and turns stored profiles into mode_changed events", async () => {
    const db = await openDb(await databaseBefore0002());
    expect(await cardLog(db, "k")).toEqual([
      { id: "e1", type: "status_changed", card_id: "k", actor: "h", at: "2026-11-01T09:00:00Z", from: "backlog", to: { state: "ready" } },
    ]);
    const person = await getTeammate(db, "h");
    expect(person?.kind === "human" && person.process_profile).toEqual({ frame_problem: "assist", write_issues: "delegate" });
    // Carried on through 0004, the stored role becomes the person's roles.
    expect(person?.kind === "human" && person.roles).toEqual(["ux"]);
    const changes = (await boardLog(db)).filter((e) => e.type === "mode_changed");
    expect(changes).toEqual([
      expect.objectContaining({ id: "migrated-mode-h-frame_problem", teammate_id: "h", actor: "h", function_id: "frame_problem", from: null, to: "assist" }),
      expect.objectContaining({ id: "migrated-mode-h-write_issues", teammate_id: "h", actor: "h", function_id: "write_issues", from: null, to: "delegate" }),
    ]);
    expect(await getTeammate(db, "a")).toEqual({ kind: "ai", id: "a", name: "Invented AI" });
  });
});
