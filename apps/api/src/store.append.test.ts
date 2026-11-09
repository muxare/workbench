// Tests for the store's batch append, append listeners and question view.
// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import type { CardEvent } from "@workbench/shared";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";
import {
  addCard,
  appendEvents,
  cardStatus,
  eventsAfter,
  lastSeq,
  listQuestions,
  onAppend,
  seed,
  StoreError,
  type StoredEvent,
} from "./store.ts";

const functionIds = loadFunctionIds();
const at = "2026-11-07T10:00:00Z";

let db: Db;
beforeEach(async () => {
  db = await openDb(":memory:");
  await seed(
    db,
    {
      teammates: [
        { kind: "human", id: "h", name: "Invented human", role: "ux" },
        { kind: "ai", id: "a", name: "Invented AI" },
      ],
      cycles: [],
      cards: [{ id: "k", title: "Invented card", function_id: "frame_problem", owner: "h", links: [] }],
      events: [],
    },
    functionIds,
  );
});

const toReady: CardEvent = { id: "e1", type: "status_changed", card_id: "k", actor: "h", at, from: "backlog", to: { state: "ready" } };
const toProgress: CardEvent = { id: "e2", type: "status_changed", card_id: "k", actor: "h", at, from: "ready", to: { state: "in_progress" } };

async function storeError(p: Promise<unknown>): Promise<StoreError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StoreError);
  return err as StoreError;
}

describe("appendEvents", () => {
  it("checks each event against the stream as the earlier ones leave it, and returns positions", async () => {
    const stored = await appendEvents(db, [toReady, toProgress]);
    expect(stored.map((s) => s.seq)).toEqual([1, 2]);
    expect(await cardStatus(db, "k")).toEqual({ state: "in_progress" });
    expect(await lastSeq(db)).toBe(2);
    expect((await eventsAfter(db, 1)).map((s) => s.event.id)).toEqual(["e2"]);
  });

  it("stores all events or none", async () => {
    const stale = { ...toProgress, id: "e3", from: "backlog" } as CardEvent;
    const err = await storeError(appendEvents(db, [toReady, stale]));
    expect(err.code).toBe("conflict");
    expect(await lastSeq(db)).toBe(0);
  });

  it("serializes concurrent writes, so only one of two identical moves wins", async () => {
    const results = await Promise.allSettled([appendEvents(db, [toReady]), appendEvents(db, [{ ...toReady, id: "e1b" }])]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await lastSeq(db)).toBe(1);
  });

  it("marks a non-human answer as forbidden and an unknown function as such", async () => {
    const answer: CardEvent = { id: "e4", type: "answered", card_id: "k", actor: "a", at, question_id: "q", answer: "Invented." };
    expect((await storeError(appendEvents(db, [answer]))).code).toBe("forbidden");
    const card = { id: "k2", title: "Invented", function_id: "invented_missing", owner: "h", links: [] };
    expect((await storeError(addCard(db, card, functionIds))).code).toBe("unknown_function");
  });
});

describe("onAppend", () => {
  it("calls each listener once per stored event until it unsubscribes", async () => {
    const seen: StoredEvent[] = [];
    const stop = onAppend(db, (s) => seen.push(s));
    await appendEvents(db, [toReady]);
    stop();
    await appendEvents(db, [toProgress]);
    expect(seen.map((s) => [s.seq, s.event.id])).toEqual([[1, "e1"]]);
  });

  it("is not called for a write that fails", async () => {
    const seen: StoredEvent[] = [];
    onAppend(db, (s) => seen.push(s));
    await appendEvents(db, [toProgress]).catch(() => undefined);
    expect(seen).toEqual([]);
  });
});

describe("listQuestions", () => {
  it("rebuilds questions from asked and answered events, with the answerer as decider", async () => {
    await appendEvents(db, [
      { id: "e5", type: "asked", card_id: "k", actor: "a", at, question_id: "q", asked_of: "h", text: "Invented?", why_it_blocks: "Invented." },
      { id: "e6", type: "answered", card_id: "k", actor: "h", at, question_id: "q", answer: "Invented." },
    ]);
    expect(await listQuestions(db)).toEqual([
      { id: "q", card_id: "k", asked_by: "a", asked_of: "h", text: "Invented?", why_it_blocks: "Invented.", answer: "Invented.", decided_by: "h" },
    ]);
    expect(await listQuestions(db, { cardId: "other" })).toEqual([]);
  });
});
