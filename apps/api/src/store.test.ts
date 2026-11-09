// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import type { CardEvent, Teammate } from "@workbench/shared";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionDefinitions, loadFunctionIds } from "./process.ts";
import { inventedSeed } from "./seed/invented.ts";
import {
  addCard,
  addTeammate,
  appendEvent,
  boardLog,
  cardLog,
  cardStatus,
  cycleLog,
  listCards,
  listTeammates,
  seed,
  StoreError,
  type SeedData,
} from "./store.ts";

const functionIds = loadFunctionIds();
const at = (minute: number) => `2026-11-06T10:${String(minute).padStart(2, "0")}:00Z`;

/** A small invented board: two cards, one human, one AI, two cycles. */
const tiny: SeedData = {
  teammates: [
    { kind: "human", id: "t-human", name: "Invented human", role: "ux", process_profile: { frame_problem: "assist" } },
    { kind: "ai", id: "t-ai", name: "Invented AI" },
  ],
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

const ids = (events: CardEvent[]) => events.map((e) => e.id);

let db: Db;
beforeEach(async () => {
  db = await openDb(":memory:");
  await seed(db, tiny, functionIds);
});

describe("teammates", () => {
  it("stores a person's role and reads it back, and gives an AI teammate none", async () => {
    const byId = new Map((await listTeammates(db)).map((t) => [t.id, t]));
    expect(byId.get("t-human")).toEqual(tiny.teammates[0]);
    expect(byId.get("t-ai")).toEqual(tiny.teammates[1]);
    expect(byId.get("t-ai")).not.toHaveProperty("role");
  });

  it("refuses a person without a role", async () => {
    const roleless = { kind: "human", id: "t-new", name: "Invented", process_profile: {} } as unknown as Teammate;
    await expect(addTeammate(db, roleless)).rejects.toThrow();
  });
});

describe("card log", () => {
  it("holds only that card's events, in stream order", async () => {
    expect(ids(await cardLog(db, "k1"))).toEqual(["v1", "v2", "v4", "v5"]);
    expect(ids(await cardLog(db, "k2"))).toEqual(["v3"]);
  });

  it("returns events exactly as appended", async () => {
    const log = await cardLog(db, "k1");
    expect(log).toEqual(tiny.events.filter((e) => e.card_id === "k1"));
  });

  it("is empty for a card with no events", async () => {
    expect(await cardLog(db, "nope")).toEqual([]);
  });
});

describe("board log", () => {
  it("holds every event on the board, in stream order", async () => {
    expect(ids(await boardLog(db))).toEqual(["v1", "v2", "v3", "v4", "v5"]);
  });

  it("keeps the latest events, oldest first, with a limit", async () => {
    expect(ids(await boardLog(db, { limit: 2 }))).toEqual(["v4", "v5"]);
  });
});

describe("cycle log", () => {
  it("holds the events whose time falls in the cycle, end excluded", async () => {
    expect(ids(await cycleLog(db, "c-early"))).toEqual(["v1", "v2", "v3"]);
    expect(ids(await cycleLog(db, "c-late"))).toEqual(["v4", "v5"]);
  });

  it("rejects an unknown cycle", async () => {
    await expect(cycleLog(db, "nope")).rejects.toThrow(StoreError);
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
    expect(await boardLog(seeded)).toEqual(inventedSeed.events);
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

  it("gives each person the role of the functions they own, except shared team functions", () => {
    const definitions = loadFunctionDefinitions();
    for (const t of inventedSeed.teammates) {
      if (t.kind !== "human") continue;
      const owned = [...Object.keys(t.process_profile), ...inventedSeed.cards.filter((c) => c.owner === t.id).map((c) => c.function_id)];
      for (const fn of owned) {
        const role = definitions.get(fn)?.role;
        if (role !== "team") expect(`${t.id} owns ${fn} (${role})`).toBe(`${t.id} owns ${fn} (${t.role})`);
      }
    }
  });

  it("picks in a mode the function allows, and an open card in the mode its owner now sets", async () => {
    // A profile holds one mode per function, so a card finished earlier may
    // have been picked in another mode, as #104 (delegate) and #105 (manual)
    // were in the history. A card still open was picked in the current one.
    const definitions = loadFunctionDefinitions();
    const owners = new Map(inventedSeed.teammates.map((t) => [t.id, t]));
    const status = new Map((await listCards(seeded)).map((c) => [c.id, c.status.state]));
    for (const event of inventedSeed.events) {
      if (event.type !== "picked") continue;
      const card = inventedSeed.cards.find((c) => c.id === event.card_id);
      const owner = card && owners.get(card.owner);
      expect(owner?.kind).toBe("human");
      if (!card || owner?.kind !== "human") continue;
      expect(definitions.get(card.function_id)?.modes.allowed).toContain(event.mode);
      if (status.get(card.id) !== "done") expect(event.mode).toBe(owner.process_profile[card.function_id]);
    }
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

  it("lists events in time order and splits them between the three sprints", async () => {
    const times = inventedSeed.events.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const lengths = await Promise.all(inventedSeed.cycles.map(async (c) => (await cycleLog(seeded, c.id)).length));
    expect(lengths.every((n) => n > 0)).toBe(true);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(inventedSeed.events.length);
  });
});
