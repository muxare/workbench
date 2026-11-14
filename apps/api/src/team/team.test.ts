// The invented teams in these tests are made up; the last block reads the real
// team files in teams/workbench/.
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client.ts";
import { loadFunctionIds } from "../process.ts";
import { addTeammate, appendEvent, eventsAfter, listCards, listCycles, listTeammates, StoreError, teamName } from "../store.ts";
import { enterCards, nameTeam, readCardsFile, readTeamFile, startTeam, teamDir, type CardsFile, type TeamFile } from "./team.ts";

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
  it("adds the team and its cycle, with no events but each person's joining and the team's name", async () => {
    await startTeam(db, team, joinedAt);
    const people = await listTeammates(db);
    expect(people.map((t) => t.id)).toEqual(["invented-ai", "invented-person"]);
    expect(people.find((t) => t.id === "invented-person")).toMatchObject({ roles: ["po", "be"], process_profile: {} });
    expect(await listCycles(db)).toEqual([team.cycle]);
    expect(await listCards(db)).toEqual([]);
    const stored = await eventsAfter(db, 0);
    expect(stored.map((s) => s.event)).toEqual([
      { id: "roles-invented-person-joined", type: "roles_changed", teammate_id: "invented-person", actor: "invented-person", at: joinedAt, from: [], to: ["po", "be"] },
      { id: `team-named-${joinedAt}`, type: "team_named", actor: "invented-person", at: joinedAt, from: null, to: { name: "Invented team" } },
    ]);
    expect(await teamName(db)).toEqual({ name: "Invented team" });
  });

  it("refuses a database that already holds a team", async () => {
    await startTeam(db, team, joinedAt);
    await expect(startTeam(db, team, joinedAt)).rejects.toThrow(StoreError);
  });
});

describe("nameTeam", () => {
  const later = "2026-11-12T09:00:00Z";

  it("does nothing when the board already has the file's name and headline", async () => {
    await startTeam(db, team, joinedAt);
    expect(await nameTeam(db, team, later)).toBe(false);
    expect((await eventsAfter(db, 0)).filter((s) => s.event.type === "team_named")).toHaveLength(1);
  });

  it("renames the board from the file, starting from the name it had", async () => {
    await startTeam(db, team, joinedAt);
    expect(await nameTeam(db, { ...team, headline: "Invented headline" }, later)).toBe(true);
    expect(await teamName(db)).toEqual({ name: "Invented team", headline: "Invented headline" });
    const last = (await eventsAfter(db, 0)).at(-1)?.event;
    expect(last).toMatchObject({ type: "team_named", from: { name: "Invented team" }, to: { name: "Invented team", headline: "Invented headline" } });
  });

  it("names a board started before team_named existed", async () => {
    for (const t of team.teammates) await addTeammate(db, t, joinedAt);
    expect(await teamName(db)).toBeNull();
    expect(await nameTeam(db, team, later)).toBe(true);
    expect((await eventsAfter(db, 0)).at(-1)?.event).toMatchObject({ type: "team_named", from: null, to: { name: "Invented team" } });
  });
});

describe("team_named in the store", () => {
  const event = { id: "n1", type: "team_named", actor: "invented-person", at: "2026-11-12T09:00:00Z", from: null, to: { name: "Other" } } as const;

  it("refuses a change from a name the board does not have", async () => {
    await startTeam(db, team, joinedAt);
    await expect(appendEvent(db, event)).rejects.toThrow(/not as the change says/);
  });

  it("refuses a change that keeps the name and headline", async () => {
    await startTeam(db, team, joinedAt);
    await expect(appendEvent(db, { ...event, from: { name: "Invented team" }, to: { name: "Invented team" } })).rejects.toThrow(/must change/);
  });

  it("refuses the AI teammate as the one who names the team", async () => {
    await startTeam(db, team, joinedAt);
    await expect(appendEvent(db, { ...event, actor: "invented-ai", from: { name: "Invented team" } })).rejects.toThrow(/by a person/);
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
    // Entering cards writes no events: only the joining and naming from startTeam are there.
    expect(await eventsAfter(db, 0)).toHaveLength(2);
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

describe("teams/workbench", () => {
  const dir = teamDir("teams/workbench");

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
