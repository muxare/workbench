// The invented teams in these tests are made up; the last block reads the real
// team files in teams/workbench/.
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client.ts";
import { loadFunctionIds } from "../process.ts";
import { addCycle, eventsAfter, listCards, listCycles, listTeammates, StoreError } from "../store.ts";
import { enterCards, readCardsFile, readTeamFile, startNextCycle, startTeam, teamDir, type CardsFile, type TeamFile } from "./team.ts";

const functionIds = loadFunctionIds();
const joinedAt = "2026-11-11T09:00:00Z";

const team: TeamFile = {
  id: "invented",
  name: "Invented team",
  teammates: [
    { kind: "human", id: "invented-person", name: "Invented person", roles: ["po", "be"] },
    { kind: "ai", id: "invented-ai", name: "Invented AI" },
  ],
  cycle: { id: "invented-cycle", name: "Invented cycle", starts_at: "2026-11-11T00:00:00Z", ends_at: "2026-11-25T00:00:00Z" },
  cycles: { length_days: 14, id: "invented-{n}", name: "Invented cycle {n}" },
};

const cards: CardsFile = {
  cards: [
    { id: "1", title: "Invented: first", function_id: "implement_services", owner: "invented-person", links: [] },
    {
      id: "2",
      title: "Invented: second",
      function_id: "implement_services",
      owner: "invented-person",
      milestone: "Invented milestone",
      links: [{ relation: "depends_on", card_id: "1" }],
    },
  ],
};

let db: Db;
beforeEach(async () => {
  db = await openDb(":memory:");
});

describe("startTeam", () => {
  it("adds the team and its cycle, with no events but each person's joining", async () => {
    await startTeam(db, team, joinedAt);
    const people = await listTeammates(db);
    expect(people.map((t) => t.id)).toEqual(["invented-ai", "invented-person"]);
    expect(people.find((t) => t.id === "invented-person")).toMatchObject({ roles: ["po", "be"], process_profile: {} });
    expect(await listCycles(db)).toEqual([team.cycle]);
    expect(await listCards(db)).toEqual([]);
    const stored = await eventsAfter(db, 0);
    expect(stored.map((s) => s.event)).toEqual([
      { id: "roles-invented-person-joined", type: "roles_changed", teammate_id: "invented-person", actor: "invented-person", at: joinedAt, from: [], to: ["po", "be"] },
    ]);
  });

  it("refuses a database that already holds a team", async () => {
    await startTeam(db, team, joinedAt);
    await expect(startTeam(db, team, joinedAt)).rejects.toThrow(StoreError);
  });
});

describe("enterCards", () => {
  beforeEach(async () => {
    await startTeam(db, team, joinedAt);
  });

  it("adds the cards in backlog, and skips them when entered again", async () => {
    expect(await enterCards(db, cards, functionIds)).toEqual({ added: ["1", "2"], skipped: [] });
    const board = await listCards(db);
    expect(board.map((c) => [c.id, c.status.state])).toEqual([
      ["1", "backlog"],
      ["2", "backlog"],
    ]);
    expect(board[1]).toMatchObject({ milestone: "Invented milestone", links: [{ relation: "depends_on", card_id: "1" }] });
    expect(await enterCards(db, cards, functionIds)).toEqual({ added: [], skipped: ["1", "2"] });
    expect(await eventsAfter(db, 0)).toHaveLength(1);
  });

  it("refuses a card whose id the board already gives to a different card, and enters nothing for it", async () => {
    await enterCards(db, { cards: [cards.cards[0]!] }, functionIds);
    const retitled = { cards: [{ ...cards.cards[0]!, title: "Invented: a different card" }] };
    const err = await enterCards(db, retitled, functionIds).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as StoreError).code).toBe("conflict");
    expect((err as StoreError).message).toMatch(/already has a different card '1'/);
    const refunctioned = { cards: [{ ...cards.cards[0]!, function_id: "write_issues" }] };
    await expect(enterCards(db, refunctioned, functionIds)).rejects.toThrow(/different card '1'/);
    expect((await listCards(db)).map((c) => c.title)).toEqual([cards.cards[0]!.title]);
  });

  it("refuses a function that process/ does not have", async () => {
    const bad = { cards: [{ ...cards.cards[0]!, function_id: "invented_missing" }] };
    await expect(enterCards(db, bad, functionIds)).rejects.toThrow(/invented_missing/);
  });

  it("refuses an owner who is not a teammate", async () => {
    const bad = { cards: [{ ...cards.cards[0]!, owner: "invented-nobody" }] };
    await expect(enterCards(db, bad, functionIds)).rejects.toThrow(/invented-nobody/);
  });

  it("refuses a dependency that is not on the board", async () => {
    await expect(enterCards(db, { cards: [cards.cards[1]!] }, functionIds)).rejects.toThrow(/depends on '1'/);
  });
});

describe("startNextCycle", () => {
  beforeEach(async () => {
    await startTeam(db, team, joinedAt);
  });

  it("adds the next cycle where the last one ends, named from the setting, and records no event", async () => {
    const next = await startNextCycle(db, team);
    expect(next).toEqual({ id: "invented-2", name: "Invented cycle 2", starts_at: "2026-11-25T00:00:00Z", ends_at: "2026-12-09T00:00:00Z" });
    expect(await startNextCycle(db, team, "Invented stage 3")).toEqual({
      id: "invented-3",
      name: "Invented stage 3",
      starts_at: "2026-12-09T00:00:00Z",
      ends_at: "2026-12-23T00:00:00Z",
    });
    expect((await listCycles(db)).map((c) => c.id)).toEqual(["invented-cycle", "invented-2", "invented-3"]);
    expect(await eventsAfter(db, 0)).toHaveLength(1);
  });

  it("refuses without a name when the setting has no name pattern, and adds nothing", async () => {
    const unnamed = { ...team, cycles: { length_days: 14, id: "invented-{n}" } };
    await expect(startNextCycle(db, unnamed)).rejects.toThrow(/name must be given/);
    expect(await listCycles(db)).toHaveLength(1);
  });

  it("refuses an id the board already has", async () => {
    // Two cycles on the board make the next one number 3, an id already taken by hand.
    await addCycle(db, { id: "invented-3", name: "Invented by hand", starts_at: "2026-12-01T00:00:00Z", ends_at: "2026-12-02T00:00:00Z" });
    const err = await startNextCycle(db, team).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as StoreError).code).toBe("conflict");
  });
});

describe("teams/workbench", () => {
  const dir = teamDir("teams/workbench");

  it("follows dev-loop-1 with a two-week dev-loop-2 under its cycle setting, named for its stage", async () => {
    const workbench = readTeamFile(dir);
    await startTeam(db, workbench, joinedAt);
    await expect(startNextCycle(db, workbench)).rejects.toThrow(/name must be given/);
    expect(await startNextCycle(db, workbench, "Invented stage name")).toEqual({
      id: "dev-loop-2",
      name: "Invented stage name",
      starts_at: "2026-11-25T00:00:00Z",
      ends_at: "2026-12-09T00:00:00Z",
    });
  });

  it("starts a board and enters every card, each naming a function in process/ and owned by a person", async () => {
    const workbench = readTeamFile(dir);
    const file = readCardsFile(dir);
    await startTeam(db, workbench, joinedAt);
    const { added } = await enterCards(db, file, functionIds);
    expect(added).toEqual(file.cards.map((c) => c.id));
    const people = new Set(workbench.teammates.filter((t) => t.kind === "human").map((t) => t.id));
    for (const c of file.cards) expect(people.has(c.owner)).toBe(true);
  });
});
