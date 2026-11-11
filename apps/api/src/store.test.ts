// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import type { CardEvent, Mode, StreamEvent, StreamEventType, TeammateRole } from "@workbench/shared";
import { eq } from "drizzle-orm";
import { deriveProfile } from "@workbench/shared";
import { openDb, type Db } from "./db/client.ts";
import { events } from "./db/schema.ts";
import { loadFunctionDefinitions, loadFunctionIds } from "./process.ts";
import { inventedSeedAt, runningCycle } from "./seed/invented.ts";

/** The invented seed as loaded on 2026-11-07, so Sprint 4 runs from 2026-11-05 to 2026-11-19. */
const inventedSeed = inventedSeedAt(new Date("2026-11-07T08:00:00Z"));
import {
  addCard,
  addTeammate,
  appendEvent,
  appendEvents,
  boardLog,
  cardLog,
  cardStatus,
  cycleLog,
  eventsAfter,
  getTeammate,
  listCards,
  listCycles,
  listTeammates,
  logFilters,
  profileEvents,
  seed,
  seedEvents,
  StoreError,
  type SeedData,
  type TeammateRecord,
} from "./store.ts";

const functionIds = loadFunctionIds();
const at = (minute: number) => `2026-11-06T10:${String(minute).padStart(2, "0")}:00Z`;

/** A small invented board: two cards, one human, one AI, two cycles. */
const tiny: SeedData = {
  teammates: [
    { kind: "human", id: "t-human", name: "Invented human", roles: ["ux"] },
    { kind: "ai", id: "t-ai", name: "Invented AI" },
  ],
  // Before both cycles, so the person's joining event is in no cycle log.
  joined_at: "2026-11-06T09:00:00Z",
  cycles: [
    { id: "c-early", name: "Invented early", starts_at: "2026-11-06T10:00:00Z", ends_at: "2026-11-06T10:30:00Z" },
    // Same instant as c-early's end, written with an offset, to check windows compare times, not strings.
    { id: "c-late", name: "Invented late", starts_at: "2026-11-06T11:30:00+01:00", ends_at: "2026-11-06T11:00:00Z" },
  ],
  cards: [
    { id: "k1", title: "Invented card one", function_id: "frame_problem", owner: "t-human", links: [] },
    { id: "k2", title: "Invented card two", function_id: "frame_problem", owner: "t-human", links: [] },
  ],
  events: [
    { id: "v1", type: "status_changed", card_id: "k1", actor: "t-human", at: at(0), from: "backlog", to: { state: "ready" } },
    // A teammate event: its subject is the person, not a card.
    { id: "m1", type: "mode_changed", teammate_id: "t-human", actor: "t-human", at: at(5), function_id: "frame_problem", from: null, to: "assist" },
    { id: "v2", type: "picked", card_id: "k1", actor: "t-ai", at: at(10), mode: "assist" },
    { id: "v3", type: "status_changed", card_id: "k2", actor: "t-human", at: at(20), from: "backlog", to: { state: "ready" } },
    {
      id: "v4",
      type: "asked",
      card_id: "k1",
      actor: "t-ai",
      at: at(30),
      question_id: "q1",
      asked_of: "t-human",
      text: "Invented question?",
      why_it_blocks: "Invented reason.",
    },
    {
      id: "v5",
      type: "status_changed",
      card_id: "k1",
      actor: "t-ai",
      at: at(40),
      from: "ready",
      to: { state: "needs_input", waiting_on: "t-human", question_id: "q1" },
    },
  ],
};

const ids = (events: readonly { id: string }[]) => events.map((e) => e.id);

let db: Db;
beforeEach(async () => {
  db = await openDb(":memory:");
  await seed(db, tiny, functionIds);
});

describe("teammates", () => {
  it("records a person's roles as a joining event and reads them back, and gives an AI teammate none", async () => {
    const byId = new Map((await listTeammates(db)).map((t) => [t.id, t]));
    expect(byId.get("t-human")).toEqual({ ...tiny.teammates[0], process_profile: { frame_problem: "assist" } });
    expect(byId.get("t-ai")).toEqual(tiny.teammates[1]);
    expect(byId.get("t-ai")).not.toHaveProperty("roles");
    expect((await boardLog(db))[0]).toEqual({
      id: "roles-t-human-joined",
      type: "roles_changed",
      teammate_id: "t-human",
      actor: "t-human",
      at: tiny.joined_at,
      from: [],
      to: ["ux"],
    });
  });

  it("refuses a person without a role, with an empty list or with a role twice, and adds nothing", async () => {
    const roleless = { kind: "human", id: "t-new", name: "Invented" } as unknown as TeammateRecord;
    await expect(addTeammate(db, roleless)).rejects.toThrow();
    await expect(addTeammate(db, { kind: "human", id: "t-new", name: "Invented", roles: [] })).rejects.toThrow();
    await expect(addTeammate(db, { kind: "human", id: "t-new", name: "Invented", roles: ["fe", "fe"] })).rejects.toThrow();
    expect(await getTeammate(db, "t-new")).toBeUndefined();
  });

  it("refuses a stored process profile, which only events may set", async () => {
    const withProfile = { kind: "human", id: "t-new", name: "Invented", roles: ["ux"], process_profile: {} } as unknown as TeammateRecord;
    await expect(addTeammate(db, withProfile)).rejects.toThrow();
  });

  it("lets one person hold every role, first role first", async () => {
    await addTeammate(db, { kind: "human", id: "t-all", name: "Invented", roles: ["po", "ux", "fe", "be"] }, at(1));
    expect(await getTeammate(db, "t-all")).toMatchObject({ roles: ["po", "ux", "fe", "be"] });
  });
});

describe("roles changes", () => {
  const change = (from: TeammateRole[], to: TeammateRole[], id = "r1", actor = "t-human"): StreamEvent => ({
    id,
    type: "roles_changed",
    teammate_id: "t-human",
    actor,
    at: at(50),
    from,
    to,
  });

  it("replace a person's roles, the latest change winning", async () => {
    await appendEvents(db, [change(["ux"], ["ux", "fe"]), change(["ux", "fe"], ["fe", "ux"], "r2")]);
    expect(await getTeammate(db, "t-human")).toMatchObject({ roles: ["fe", "ux"] });
  });

  it("refuse a stale `from` as a conflict, and a change that keeps the roles", async () => {
    await expect(appendEvent(db, change(["fe"], ["be"]))).rejects.toMatchObject({ code: "conflict" });
    await expect(appendEvent(db, change([], ["be"]))).rejects.toMatchObject({ code: "conflict" });
    await expect(appendEvent(db, change(["ux"], ["ux"]))).rejects.toMatchObject({ code: "rule_violation" });
  });

  it("are made by a person, about a person", async () => {
    await expect(appendEvent(db, change(["ux"], ["be"], "r1", "t-ai"))).rejects.toMatchObject({ code: "forbidden" });
    const aboutAi = { ...change([], ["be"]), teammate_id: "t-ai" } as StreamEvent;
    await expect(appendEvent(db, aboutAi)).rejects.toMatchObject({ code: "rule_violation" });
  });
});

describe("card log", () => {
  it("holds only that card's events, in stream order", async () => {
    expect(ids(await cardLog(db, "k1"))).toEqual(["v1", "v2", "v4", "v5"]);
    expect(ids(await cardLog(db, "k2"))).toEqual(["v3"]);
  });

  it("returns events exactly as appended", async () => {
    const log = await cardLog(db, "k1");
    expect(log).toEqual(tiny.events.filter((e) => "card_id" in e && e.card_id === "k1"));
  });

  it("is empty for a card with no events", async () => {
    expect(await cardLog(db, "nope")).toEqual([]);
  });
});

describe("board log", () => {
  it("holds every event on the board, teammate events included, in stream order", async () => {
    expect(ids(await boardLog(db))).toEqual(["roles-t-human-joined", "v1", "m1", "v2", "v3", "v4", "v5"]);
    expect(await boardLog(db)).toEqual(seedEvents(tiny));
  });

  it("keeps the latest events, oldest first, with a limit", async () => {
    expect(ids(await boardLog(db, { limit: 2 }))).toEqual(["v4", "v5"]);
  });
});

describe("cycle log", () => {
  it("holds the events whose time falls in the cycle, end excluded", async () => {
    expect(ids(await cycleLog(db, "c-early"))).toEqual(["v1", "m1", "v2", "v3"]);
    expect(ids(await cycleLog(db, "c-late"))).toEqual(["v4", "v5"]);
  });

  it("rejects an unknown cycle", async () => {
    await expect(cycleLog(db, "nope")).rejects.toThrow(StoreError);
  });

  it("lists the cycles in the order they start", async () => {
    expect((await listCycles(db)).map((c) => c.id)).toEqual(["c-early", "c-late"]);
    expect((await listCycles(db))[1]).toEqual(tiny.cycles[1]);
  });
});

describe("derived status", () => {
  it("is the latest status_changed, or backlog before any", async () => {
    expect(await cardStatus(db, "k1")).toEqual({ state: "needs_input", waiting_on: "t-human", question_id: "q1" });
    expect(await cardStatus(db, "k2")).toEqual({ state: "ready" });
    await addCard(db, { id: "k3", title: "Invented card three", function_id: "frame_problem", owner: "t-human", links: [] }, functionIds);
    const cards = await listCards(db);
    expect(cards.map((c) => [c.id, c.status.state])).toEqual([
      ["k1", "needs_input"],
      ["k2", "ready"],
      ["k3", "backlog"],
    ]);
  });
});

describe("appending events", () => {
  it("appends to the end of every log", async () => {
    await appendEvent(db, { id: "v6", type: "answered", card_id: "k1", actor: "t-human", at: at(50), question_id: "q1", answer: "Invented." });
    expect(ids(await cardLog(db, "k1")).at(-1)).toBe("v6");
    expect(ids(await boardLog(db)).at(-1)).toBe("v6");
  });

  it("rejects a status change whose `from` is not the current state", async () => {
    const stale: CardEvent = { id: "v6", type: "status_changed", card_id: "k2", actor: "t-human", at: at(50), from: "backlog", to: { state: "in_progress" } };
    await expect(appendEvent(db, stale)).rejects.toThrow(/is ready, not backlog/);
  });

  it("rejects an answer from the AI, because deciding stays human", async () => {
    const answer: CardEvent = { id: "v6", type: "answered", card_id: "k1", actor: "t-ai", at: at(50), question_id: "q1", answer: "Invented." };
    await expect(appendEvent(db, answer)).rejects.toThrow(/decided by a human/);
  });

  it("rejects an event that fails the shared schema", async () => {
    const bad = { id: "v6", type: "picked", card_id: "k1", actor: "t-ai", at: "yesterday", mode: "assist" } as CardEvent;
    await expect(appendEvent(db, bad)).rejects.toThrow();
  });

  it("rejects an event on an unknown card", async () => {
    const orphan: CardEvent = { id: "v6", type: "picked", card_id: "nope", actor: "t-ai", at: at(50), mode: "assist" };
    await expect(appendEvent(db, orphan)).rejects.toThrow();
  });

  it("rejects a duplicate event id", async () => {
    const dup: CardEvent = { id: "v1", type: "picked", card_id: "k2", actor: "t-ai", at: at(50), mode: "assist" };
    await expect(appendEvent(db, dup)).rejects.toThrow();
  });
});

describe("mode changes", () => {
  const change = (id: string, from: Mode | null, to: Mode, over: object = {}): StreamEvent => ({
    id,
    type: "mode_changed",
    teammate_id: "t-human",
    actor: "t-human",
    at: at(50),
    function_id: "frame_problem",
    from,
    to,
    ...over,
  });

  it("derive the person's profile: the latest change for a function wins", async () => {
    await appendEvents(db, [change("m2", "assist", "manual"), change("m3", null, "delegate", { function_id: "write_issues" })]);
    const person = await getTeammate(db, "t-human");
    expect(person?.kind === "human" && person.process_profile).toEqual({ frame_problem: "manual", write_issues: "delegate" });
    const listed = (await listTeammates(db)).find((t) => t.id === "t-human");
    expect(listed).toEqual(person);
  });

  it("stay out of the card log but reach the board log and the stream", async () => {
    await appendEvent(db, change("m2", "assist", "manual"));
    expect(ids(await cardLog(db, "k1"))).not.toContain("m2");
    expect(ids(await boardLog(db)).at(-1)).toBe("m2");
    expect((await eventsAfter(db, 0)).map((s) => s.event.id)).toContain("m2");
  });

  it("must name the person's current mode as `from`, null for the default", async () => {
    await expect(appendEvent(db, change("m2", null, "manual"))).rejects.toMatchObject({ code: "conflict" });
    await expect(appendEvent(db, change("m2", "delegate", "manual"))).rejects.toThrow(/works frame_problem in assist, not delegate/);
  });

  it("are checked against the earlier changes in the same write", async () => {
    await appendEvents(db, [change("m2", "assist", "manual"), change("m3", "manual", "delegate")]);
    await expect(appendEvents(db, [change("m4", "delegate", "manual"), change("m5", "delegate", "assist")])).rejects.toMatchObject({
      code: "conflict",
    });
    expect(ids(await boardLog(db)).at(-1)).toBe("m3");
  });

  it("must change the mode, be about a person, and name a known teammate", async () => {
    await expect(appendEvent(db, change("m2", "assist", "assist"))).rejects.toThrow(/must change the mode/);
    await expect(appendEvent(db, change("m2", null, "assist", { teammate_id: "t-ai", actor: "t-ai" }))).rejects.toThrow(/not a person/);
    await expect(appendEvent(db, change("m2", null, "assist", { teammate_id: "t-nobody" }))).rejects.toMatchObject({ code: "not_found" });
  });

  it("are what profileEvents builds for a person starting with a profile", () => {
    expect(profileEvents("t-human", { frame_problem: "assist" }, at(5), "x-")).toEqual([
      { id: "x-t-human-frame_problem", type: "mode_changed", teammate_id: "t-human", actor: "t-human", at: at(5), function_id: "frame_problem", from: null, to: "assist" },
    ]);
  });
});

describe("log filter changes", () => {
  const change = (id: string, hidden: StreamEventType[], wasHidden: StreamEventType[], over: object = {}): StreamEvent => ({
    id,
    type: "log_filter_changed",
    actor: "t-human",
    at: at(50),
    log: "board",
    hidden,
    was_hidden: wasHidden,
    ...over,
  });

  it("leave every log showing everything until someone changes one", async () => {
    expect(await logFilters(db)).toEqual({ card: [], board: [], cycle: [], teammate: [] });
  });

  it("derive the team's filters: the latest change per log wins", async () => {
    await appendEvents(db, [
      change("f1", ["mode_changed"], []),
      change("f2", ["picked"], [], { log: "card" }),
      change("f3", ["mode_changed", "report_posted"], ["mode_changed"]),
    ]);
    expect(await logFilters(db)).toEqual({ card: ["picked"], board: ["mode_changed", "report_posted"], cycle: [], teammate: [] });
  });

  it("are stored about the team, and hide nothing from the stream or any log query", async () => {
    await appendEvent(db, change("f1", ["mode_changed", "status_changed"], []));
    const [row] = await db.select().from(events).where(eq(events.id, "f1"));
    expect(row).toMatchObject({ cardId: null, teammateId: null, type: "log_filter_changed" });
    expect(ids(await boardLog(db))).toEqual(["roles-t-human-joined", "v1", "m1", "v2", "v3", "v4", "v5", "f1"]);
    expect(ids(await cardLog(db, "k1"))).toEqual(["v1", "v2", "v4", "v5"]);
    expect((await eventsAfter(db, 0)).map((s) => s.event.id)).toContain("m1");
    expect(await cardStatus(db, "k1")).toMatchObject({ state: "needs_input" });
  });

  it("must name what the log hides now as was_hidden, in any order", async () => {
    await appendEvent(db, change("f1", ["picked", "mode_changed"], []));
    await expect(appendEvent(db, change("f2", ["asked"], ["picked"]))).rejects.toMatchObject({ code: "conflict" });
    await expect(appendEvent(db, change("f2", ["asked"], []))).rejects.toThrow(/hides picked, mode_changed, not nothing/);
    await appendEvent(db, change("f2", [], ["mode_changed", "picked"]));
    expect((await logFilters(db)).board).toEqual([]);
  });

  it("are checked against earlier changes in the same write", async () => {
    await expect(
      appendEvents(db, [change("f1", ["picked"], []), change("f2", ["asked"], [])]),
    ).rejects.toMatchObject({ code: "conflict" });
    await appendEvents(db, [change("f1", ["picked"], []), change("f2", ["asked"], ["picked"])]);
    expect((await logFilters(db)).board).toEqual(["asked"]);
  });

  it("must change what the log hides and come from a person", async () => {
    await expect(appendEvent(db, change("f1", [], []))).rejects.toThrow(/must change what the board log hides/);
    await expect(appendEvent(db, change("f1", ["picked"], [], { actor: "t-ai" }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(appendEvent(db, change("f1", ["picked"], [], { actor: "t-nobody" }))).rejects.toMatchObject({ code: "not_found" });
    expect(await logFilters(db)).toEqual({ card: [], board: [], cycle: [], teammate: [] });
  });

  it("check a stale was_hidden before anything else, so a stale no-change is a conflict", async () => {
    await appendEvent(db, change("f1", ["picked"], []));
    await expect(appendEvent(db, change("f2", [], []))).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("cards", () => {
  it("must name a function that exists in process/functions", async () => {
    const card = { id: "k9", title: "Invented", function_id: "no_such_function", owner: "t-human", links: [] };
    await expect(addCard(db, card, functionIds)).rejects.toThrow(/no function 'no_such_function'/);
  });
});

describe("invented seed", () => {
  let seeded: Db;
  beforeEach(async () => {
    seeded = await openDb(":memory:");
    await seed(seeded, inventedSeed, functionIds);
  });

  it("loads through the store's checks and stores every event", async () => {
    expect(await boardLog(seeded)).toEqual(seedEvents(inventedSeed));
    expect(await listTeammates(seeded)).toHaveLength(inventedSeed.teammates.length);
  });

  it("marks every teammate, cycle and card as invented", () => {
    const labels = [
      ...inventedSeed.teammates.map((t) => t.id + t.name),
      ...inventedSeed.cycles.map((c) => c.id + c.name),
      ...inventedSeed.cards.map((c) => c.id + c.title),
    ];
    for (const label of labels) expect(label).toMatch(/invented/i);
  });

  it("uses only functions defined in process/functions", () => {
    for (const card of inventedSeed.cards) expect(functionIds).toContain(card.function_id);
  });

  it("gives each person a role of each function they own, except shared team functions", () => {
    const definitions = loadFunctionDefinitions();
    for (const t of inventedSeed.teammates) {
      if (t.kind !== "human") continue;
      const chosen = inventedSeed.events.flatMap((e) => (e.type === "mode_changed" && e.teammate_id === t.id ? [e.function_id] : []));
      const owned = [...chosen, ...inventedSeed.cards.filter((c) => c.owner === t.id).map((c) => c.function_id)];
      for (const fn of owned) {
        const role = definitions.get(fn)?.role;
        if (role !== "team") expect(t.roles.map((r) => `${t.id} owns ${fn} (${r})`)).toContain(`${t.id} owns ${fn} (${role})`);
      }
    }
  });

  it("picks every card in a mode the function allows, the one its owner had set at the time", () => {
    // The owners' modes are mode_changed events, so the stream says which
    // mode was set when each card was picked: #104 in delegate and #105 in
    // manual, as in the history, though both owners work in assist now.
    const definitions = loadFunctionDefinitions();
    const owners = new Map(inventedSeed.teammates.map((t) => [t.id, t]));
    for (const [index, event] of inventedSeed.events.entries()) {
      if (event.type !== "picked") continue;
      const card = inventedSeed.cards.find((c) => c.id === event.card_id);
      const owner = card && owners.get(card.owner);
      expect(owner?.kind).toBe("human");
      if (!card || owner?.kind !== "human") continue;
      expect(definitions.get(card.function_id)?.modes.allowed).toContain(event.mode);
      const then = deriveProfile(inventedSeed.events.slice(0, index), owner.id);
      expect(`${card.id} picked in ${event.mode}`).toBe(`${card.id} picked in ${then[card.function_id]}`);
    }
  });

  it("ends with each person's profile as the history leaves it", async () => {
    const profiles = Object.fromEntries(
      (await listTeammates(seeded)).flatMap((t) => (t.kind === "human" ? [[t.id, t.process_profile]] : [])),
    );
    expect(profiles).toEqual({
      "invented-po": { write_issues: "delegate" },
      "invented-ux": { frame_problem: "assist" },
      "invented-fe": { refine_ui_spec: "assist" },
      "invented-be": { define_api_contract: "assist" },
    });
  });

  it("works in every mode at least once, as the example requires", () => {
    const modes = new Set(inventedSeed.events.flatMap((e) => (e.type === "picked" ? [e.mode] : [])));
    expect([...modes].sort()).toEqual(["assist", "delegate", "manual"]);
  });

  it("stops in step 7 of the history: the contract waits on the product owner, I-8 is open, and the AI has a card to pick", async () => {
    const cards = new Map((await listCards(seeded)).map((c) => [c.id, c.status]));
    for (const id of ["invented-101", "invented-102", "invented-103", "invented-104", "invented-105"]) {
      expect(cards.get(id)).toEqual({ state: "done" });
    }
    expect(cards.get("invented-106")).toEqual({ state: "needs_input", waiting_on: "invented-po", question_id: "invented-q106" });
    expect(cards.get("invented-107")).toEqual({ state: "in_progress" });
    expect(cards.get("invented-108")).toEqual({ state: "ready" });
    const log101 = (await cardLog(seeded, "invented-101")).map((e) => e.type);
    expect(log101.filter((t) => t === "asked")).toHaveLength(2);
    expect(log101.filter((t) => t === "answered")).toHaveLength(2);
  });

  it("lists events, joining included, in time order and splits them between the four sprints", async () => {
    const times = seedEvents(inventedSeed).map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const lengths = await Promise.all(inventedSeed.cycles.map(async (c) => (await cycleLog(seeded, c.id)).length));
    expect(lengths.every((n) => n > 0)).toBe(true);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(seedEvents(inventedSeed).length);
  });

  it("puts only #108's move to Ready in Sprint 4, after the history's log", async () => {
    const sprint4 = await cycleLog(seeded, "invented-sprint-4");
    expect(sprint4).toHaveLength(1);
    expect(sprint4[0]).toMatchObject({ type: "status_changed", card_id: "invented-108", actor: "invented-po", at: "2026-11-05T09:00:00.000Z", to: { state: "ready" } });
    expect(inventedSeed.events.at(-1)).toEqual(sprint4[0]);
  });
});

describe("runningCycle", () => {
  const holds = (c: { starts_at: string; ends_at: string }, at: string) => Date.parse(c.starts_at) <= Date.parse(at) && Date.parse(at) < Date.parse(c.ends_at);

  it("runs two weeks from 06:00 UTC two days before the seed time", () => {
    expect(runningCycle(new Date("2026-11-09T14:00:00Z"))).toEqual({
      id: "invented-sprint-4",
      name: "Sprint 4 (invented)",
      starts_at: "2026-11-07T06:00:00.000Z",
      ends_at: "2026-11-21T06:00:00.000Z",
    });
  });

  it("holds the seed time and ConCon on 2026-11-18 when seeded from 2026-11-07 to the morning of the talk", () => {
    for (const day of ["2026-11-07T00:30:00Z", "2026-11-09T09:00:00Z", "2026-11-17T22:00:00Z", "2026-11-18T07:00:00Z"]) {
      const c = runningCycle(new Date(day));
      expect(holds(c, day)).toBe(true);
      expect(holds(c, "2026-11-18T12:00:00Z")).toBe(true);
    }
  });

  it("never starts before Sprint 3 ends", () => {
    expect(runningCycle(new Date("2026-10-13T12:00:00Z")).starts_at).toBe("2026-10-12T06:00:00.000Z");
  });

  it("keeps #108's move to Ready in the window and in the past for any seed time", () => {
    for (const day of ["2026-10-12T07:00:00Z", "2026-11-09T05:00:00Z", "2026-11-18T07:00:00Z"]) {
      const seededAt = new Date(day);
      const data = inventedSeedAt(seededAt);
      const ready = data.events.at(-1)!;
      expect(ready).toMatchObject({ type: "status_changed", card_id: "invented-108" });
      expect(holds(data.cycles.at(-1)!, ready.at)).toBe(true);
      expect(Date.parse(ready.at)).toBeLessThanOrEqual(seededAt.getTime());
    }
  });
});
