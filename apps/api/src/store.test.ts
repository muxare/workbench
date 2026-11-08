// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import type { CardEvent } from "@workbench/shared";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";
import { inventedSeed } from "./seed/invented.ts";
import {
  addCard,
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
    { kind: "human", id: "t-human", name: "Invented human", process_profile: { frame_problem: "assist" } },
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

  it("picks every card in the mode its owner set for the card's function", () => {
    const owners = new Map(inventedSeed.teammates.map((t) => [t.id, t]));
    for (const event of inventedSeed.events) {
      if (event.type !== "picked") continue;
      const card = inventedSeed.cards.find((c) => c.id === event.card_id);
      const owner = card && owners.get(card.owner);
      expect(owner?.kind).toBe("human");
      if (owner?.kind === "human" && card) expect(event.mode).toBe(owner.process_profile[card.function_id]);
    }
  });

  it("shows the first slice: a card waiting on a person, and one answered and back in progress", async () => {
    const cards = new Map((await listCards(seeded)).map((c) => [c.id, c.status]));
    expect(cards.get("invented-151")).toEqual({ state: "needs_input", waiting_on: "invented-be", question_id: "invented-q151" });
    expect(cards.get("invented-142")).toEqual({ state: "in_progress" });
    expect(cards.get("invented-138")).toEqual({ state: "done" });
    expect(cards.get("invented-153")).toEqual({ state: "backlog" });
    const log142 = (await cardLog(seeded, "invented-142")).map((e) => e.type);
    expect(log142).toEqual(["status_changed", "picked", "status_changed", "asked", "status_changed", "answered", "status_changed"]);
  });

  it("splits the stream between the two sprints", async () => {
    const s13 = await cycleLog(seeded, "invented-sprint-13");
    const s14 = await cycleLog(seeded, "invented-sprint-14");
    expect(s13.every((e) => e.card_id === "invented-138")).toBe(true);
    expect(s13).toHaveLength(3);
    expect(s13.length + s14.length).toBe(inventedSeed.events.length);
  });
});
