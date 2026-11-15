// All data here is invented.
import { describe, expect, it } from "vitest";
import { checkPlan, deriveBatches, nextBatchId, openBatches } from "./batch.ts";
import { batchHanded, batchPlanned, streamEvent, teamEvent, type Card, type CardStatus, type StreamEvent } from "./domain.ts";

const at = "2026-11-15T10:00:00Z";

const card = (id: string, state: CardStatus = "ready", dependsOn: string[] = []): Card => ({
  id,
  title: `Invented card ${id}`,
  function_id: "refine_ui_spec",
  owner: "invented-fe",
  status: { state } as Card["status"],
  links: dependsOn.map((card_id) => ({ relation: "depends_on" as const, card_id })),
});

const handed = (batch_id: string, card_ids: string[], id = `h${batch_id}`): StreamEvent => ({
  id,
  type: "batch_handed",
  actor: "invented-po",
  at,
  batch_id,
  card_ids,
  handed_to: "invented-ai",
});

const planned = (batch_id: string, waves: { card_ids: string[]; note: string }[], id = `p${batch_id}`): StreamEvent => ({
  id,
  type: "batch_planned",
  actor: "invented-ai",
  at,
  batch_id,
  waves,
});

describe("batch events", () => {
  it("are team events, with neither a card nor a teammate", () => {
    const e = handed("1", ["1", "2"]);
    expect(teamEvent.parse(e)).toEqual(e);
    expect(streamEvent.parse(e)).toEqual(e);
    const p = planned("1", [{ card_ids: ["1", "2"], note: "Invented: no overlap." }]);
    expect(streamEvent.parse(p)).toEqual(p);
  });

  it("refuse a batch of one card, a card listed twice, an empty plan, an empty wave and a wave without a note", () => {
    const base = { id: "h", type: "batch_handed", actor: "invented-po", at, batch_id: "1", handed_to: "invented-ai" };
    expect(batchHanded.safeParse({ ...base, card_ids: ["1"] }).success).toBe(false);
    expect(batchHanded.safeParse({ ...base, card_ids: ["1", "1"] }).success).toBe(false);
    const plan = { id: "p", type: "batch_planned", actor: "invented-ai", at, batch_id: "1" };
    expect(batchPlanned.safeParse({ ...plan, waves: [] }).success).toBe(false);
    expect(batchPlanned.safeParse({ ...plan, waves: [{ card_ids: [], note: "x" }] }).success).toBe(false);
    expect(batchPlanned.safeParse({ ...plan, waves: [{ card_ids: ["1"], note: "" }] }).success).toBe(false);
  });
});

describe("deriveBatches", () => {
  it("is handed until planned, planned after, and finished once every card is in review or done", () => {
    const events = [handed("1", ["1", "2"]), handed("2", ["3", "4"]), planned("2", [{ card_ids: ["3", "4"], note: "Invented." }])];
    const cards = [card("1", "in_progress"), card("2"), card("3", "review"), card("4", "in_progress")];
    const batches = deriveBatches(events, cards);
    expect(batches.map((b) => [b.id, b.state])).toEqual([
      ["1", "handed"],
      ["2", "planned"],
    ]);
    expect(batches[0]).toMatchObject({ handed_by: "invented-po", handed_to: "invented-ai", handed_at: at, plan: null });
    expect(batches[1]?.plan).toEqual({ waves: [{ card_ids: ["3", "4"], note: "Invented." }], planned_by: "invented-ai", planned_at: at });

    const later = deriveBatches(events, [card("1", "done"), card("2", "review"), card("3", "review"), card("4", "in_progress")]);
    expect(later.map((b) => b.state)).toEqual(["finished", "planned"]);
    expect(openBatches(later).map((b) => b.id)).toEqual(["2"]);
  });

  it("counts a card it cannot see as unfinished, ignores a plan for no batch, and keeps only the first plan", () => {
    const events = [
      planned("9", [{ card_ids: ["1"], note: "Invented." }]),
      handed("1", ["1", "2"]),
      planned("1", [{ card_ids: ["1", "2"], note: "first" }]),
      planned("1", [{ card_ids: ["2"], note: "second" }, { card_ids: ["1"], note: "second" }], "p1-again"),
    ];
    const [only, ...rest] = deriveBatches(events, [card("1", "done")]);
    expect(rest).toEqual([]);
    expect(only?.state).toBe("planned");
    expect(only?.plan?.waves[0]?.note).toBe("first");
  });
});

describe("nextBatchId", () => {
  it("is one more than the highest plain-number batch id, or 1", () => {
    expect(nextBatchId([])).toBe("1");
    expect(nextBatchId([handed("2", ["1", "2"]), handed("10", ["3", "4"]), handed("invented-7", ["5", "6"])])).toBe("11");
  });
});

describe("checkPlan", () => {
  const cards = [card("1"), card("2", "ready", ["1"]), card("3", "ready", ["outside"])];
  const ids = ["1", "2", "3"];

  it("accepts every card once, each after the batch cards it depends on", () => {
    expect(
      checkPlan(ids, [
        { card_ids: ["1", "3"], note: "Invented: different files." },
        { card_ids: ["2"], note: "Invented: needs #1." },
      ], cards),
    ).toEqual({ ok: true });
  });

  it("refuses a card left out, a card repeated and a card not in the batch", () => {
    expect(checkPlan(ids, [{ card_ids: ["1", "3"], note: "n" }], cards)).toEqual({ ok: false, reason: "the plan leaves out 2" });
    expect(checkPlan(ids, [{ card_ids: ["1", "3"], note: "n" }, { card_ids: ["2", "1"], note: "n" }], cards)).toEqual({
      ok: false,
      reason: "1 is in the plan twice",
    });
    expect(checkPlan(ids, [{ card_ids: ["1", "2", "3", "4"], note: "n" }], cards)).toEqual({ ok: false, reason: "4 is not in the batch" });
  });

  it("refuses a card in the same wave as, or before, a card it depends on", () => {
    expect(checkPlan(ids, [{ card_ids: ["1", "2", "3"], note: "n" }], cards)).toMatchObject({ ok: false, reason: expect.stringMatching(/2 depends on 1/) });
    expect(checkPlan(ids, [{ card_ids: ["2"], note: "n" }, { card_ids: ["1", "3"], note: "n" }], cards)).toMatchObject({ ok: false });
  });
});
