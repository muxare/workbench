// Route and store tests for batches of cards handed to the AI
// (docs/dev-loop.md, stage 3b), against an in-memory database loaded with the
// invented seed. All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiError,
  batchDetailResponse,
  batchesResponse,
  batchResponse,
  boardResponse,
  cardResponse,
  type StreamEvent,
} from "@workbench/shared";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";
import { inventedSeedAt } from "./seed/invented.ts";
import { appendEvents, handBatch, lastSeq, listBatches, onAppend, seed, StoreError } from "./store.ts";

const inventedSeed = inventedSeedAt(new Date("2026-11-07T08:00:00Z"));
const functionIds = loadFunctionIds();
const PO = "invented-po";
const FE = "invented-fe";
const AI = "invented-ai";
const AT = "2026-11-07T10:00:00.000Z";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = await openDb(":memory:");
  await seed(db, inventedSeed, functionIds);
  let n = 0;
  app = createApp({ db, functionIds, now: () => new Date(AT), newId: () => `invented-new-${++n}` });
});

function post(path: string, payload: unknown, raw = false) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (payload as string) : JSON.stringify(payload),
  });
}

async function expectProblem(res: Response, status: number, error: string, reason?: RegExp) {
  expect(res.status).toBe(status);
  const body = apiError.parse(await res.json());
  expect(body.error).toBe(error);
  if (reason) expect(body.reason).toMatch(reason);
  return body;
}

/** A new refine_ui_spec card of FE's, moved to Ready by FE, so the AI may pick it in FE's assist mode. */
async function readyCard(title: string, dependsOn: string[] = []): Promise<string> {
  const links = dependsOn.map((card_id) => ({ relation: "depends_on", card_id }));
  const res = await post("/api/cards", { actor: PO, title: `Invented: ${title}`, function_id: "refine_ui_spec", owner: FE, links });
  const id = ((await res.json()) as { card: { id: string } }).card.id;
  await post(`/api/cards/${id}/status`, { actor: FE, from: "backlog", to: { state: "ready" } });
  return id;
}

const hand = (card_ids: unknown, actor = PO) => post("/api/batches", { actor, card_ids });
const plan = (id: string, waves: unknown, actor = AI) => post(`/api/batches/${id}/plan`, { actor, waves });

describe("POST /api/batches", () => {
  it("hands Ready cards to the AI teammate under the next number, as one team event", async () => {
    const first = await readyCard("first");
    const second = await readyCard("second");
    const before = await lastSeq(db);
    const res = await hand([first, second, "invented-108"]);
    expect(res.status).toBe(201);
    const { batch } = batchResponse.parse(await res.json());
    expect(batch).toEqual({
      id: "1",
      card_ids: [first, second, "invented-108"],
      handed_to: AI,
      handed_by: PO,
      handed_at: AT,
      state: "handed",
      plan: null,
    });
    expect(await lastSeq(db)).toBe(before + 1);
    const board = boardResponse.parse(await (await app.request("/api/board")).json());
    expect(board.batches).toEqual([batch]);
    expect(board.log.at(-1)).toMatchObject({ type: "batch_handed", batch_id: "1", actor: PO, handed_to: AI });

    const third = await readyCard("third");
    const fourth = await readyCard("fourth");
    expect(batchResponse.parse(await (await hand([third, fourth])).json()).batch.id).toBe("2");
  });

  it("takes a card with the batch card it depends on, which the plan puts first", async () => {
    const first = await readyCard("first");
    const second = await readyCard("second", [first]);
    expect((await hand([first, second])).status).toBe(201);
  });

  it("reaches the stream's listeners, which GET /api/events sends on", async () => {
    const first = await readyCard("first");
    const second = await readyCard("second");
    const seen: StreamEvent[] = [];
    const stop = onAppend(db, (s) => seen.push(s.event));
    await hand([first, second]);
    stop();
    expect(seen.map((e) => e.type)).toEqual(["batch_handed"]);
  });

  it("refuses a card that is not Ready, and appends nothing", async () => {
    const first = await readyCard("first");
    const before = await lastSeq(db);
    await expectProblem(await hand([first, "invented-104"]), 409, "conflict", /invented-104: card is done, not ready/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("refuses a card already in an open batch", async () => {
    const first = await readyCard("first");
    const second = await readyCard("second");
    const third = await readyCard("third");
    await hand([first, second]);
    await expectProblem(await hand([third, second]), 409, "conflict", new RegExp(`${second} is already in batch 1`));
  });

  it("refuses a card the AI may not pick under its owner's mode", async () => {
    const first = await readyCard("first");
    await post(`/api/teammates/${FE}/modes`, { actor: FE, function_id: "refine_ui_spec", mode: "manual" });
    await expectProblem(await hand([first, "invented-108"]), 409, "conflict", /invented-ai may not pick .*manual/);
  });

  it("refuses a card that depends on a card outside the batch that is not done", async () => {
    const first = await readyCard("first");
    const second = await readyCard("second", [first]);
    await expectProblem(await hand([second, "invented-108"]), 409, "conflict", new RegExp(`depends on ${first}, which is not done`));
  });

  it("refuses an unknown card, a bad body, an AI handing over, and handing to a person", async () => {
    const first = await readyCard("first");
    await expectProblem(await hand([first, "invented-nope"]), 404, "not_found", /invented-nope/);
    await expectProblem(await hand([first]), 400, "invalid_request", /card_ids/);
    await expectProblem(await hand([first, first]), 400, "invalid_request", /twice/);
    await expectProblem(await post("/api/batches", "{not json", true), 400, "invalid_request", /JSON/);
    await expectProblem(await hand([first, "invented-108"], AI), 403, "forbidden", /by a person/);
    await expectProblem(
      await post("/api/batches", { actor: PO, card_ids: [first, "invented-108"], handed_to: FE }),
      422,
      "rule_violation",
      /not an AI teammate/,
    );
    await expectProblem(await hand([first, "invented-108"], "invented-ghost"), 422, "rule_violation", /ghost/);
  });
});

describe("POST /api/batches/:id/plan", () => {
  async function handedBatch() {
    const first = await readyCard("first");
    const second = await readyCard("second", [first]);
    const third = await readyCard("third");
    await hand([first, second, third]);
    return { first, second, third };
  }

  it("records the AI's plan, which makes the batch planned", async () => {
    const { first, second, third } = await handedBatch();
    const waves = [
      { card_ids: [first, third], note: "Invented: different screens." },
      { card_ids: [second], note: `Invented: needs ${first}.` },
    ];
    const res = await plan("1", waves);
    expect(res.status).toBe(200);
    const { batch } = batchResponse.parse(await res.json());
    expect(batch.state).toBe("planned");
    expect(batch.plan).toEqual({ waves, planned_by: AI, planned_at: AT });
    const planned = batchesResponse.parse(await (await app.request("/api/batches?state=planned")).json());
    expect(planned.batches.map((b) => b.id)).toEqual(["1"]);
    const handed = batchesResponse.parse(await (await app.request("/api/batches?state=handed")).json());
    expect(handed.batches).toEqual([]);
  });

  it("refuses a second plan", async () => {
    const { first, second, third } = await handedBatch();
    const waves = [
      { card_ids: [first, third], note: "Invented." },
      { card_ids: [second], note: "Invented." },
    ];
    await plan("1", waves);
    await expectProblem(await plan("1", waves), 409, "conflict", /already has a plan/);
  });

  it("refuses a plan that leaves out, repeats or misorders a card, with the reason, and appends nothing", async () => {
    const { first, second, third } = await handedBatch();
    const before = await lastSeq(db);
    await expectProblem(await plan("1", [{ card_ids: [first, third], note: "n" }]), 409, "conflict", new RegExp(`leaves out ${second}`));
    await expectProblem(
      await plan("1", [
        { card_ids: [first, third], note: "n" },
        { card_ids: [second, third], note: "n" },
      ]),
      409,
      "conflict",
      new RegExp(`${third} is in the plan twice`),
    );
    await expectProblem(await plan("1", [{ card_ids: [first, second, third], note: "n" }]), 409, "conflict", new RegExp(`${second} depends on ${first}`));
    expect(await lastSeq(db)).toBe(before);
  });

  it("refuses anyone but the AI teammate the batch was handed to, an unknown batch and a bad body", async () => {
    const { first, second, third } = await handedBatch();
    const waves = [
      { card_ids: [first, third], note: "n" },
      { card_ids: [second], note: "n" },
    ];
    await expectProblem(await plan("1", waves, PO), 403, "forbidden", /handed to invented-ai/);
    await expectProblem(await plan("9", waves), 404, "not_found", /no batch '9'/);
    await expectProblem(await plan("1", []), 400, "invalid_request", /waves/);
    await expectProblem(await plan("1", [{ card_ids: [first], note: "" }]), 400, "invalid_request");
  });
});

describe("GET /api/batches and /api/batches/:id", () => {
  it("serves a batch with each card as GET /api/cards/:id does", async () => {
    const first = await readyCard("first");
    await hand([first, "invented-108"]);
    const res = await app.request("/api/batches/1");
    expect(res.status).toBe(200);
    const detail = batchDetailResponse.parse(await res.json());
    expect(detail.batch.id).toBe("1");
    expect(detail.cards.map((c) => c.card.id)).toEqual([first, "invented-108"]);
    const single = cardResponse.parse(await (await app.request("/api/cards/invented-108")).json());
    expect(detail.cards[1]).toEqual(single);
    expect(detail.cards[1]?.function?.name).toBe("refine_ui_spec");
    await expectProblem(await app.request("/api/batches/9"), 404, "not_found");
  });

  it("lists open batches oldest first, and drops a batch once every card is in review or done", async () => {
    const [a, b, c, d] = [await readyCard("a"), await readyCard("b"), await readyCard("c"), await readyCard("d")];
    await hand([a, b]);
    await hand([c, d]);
    const list = async () => batchesResponse.parse(await (await app.request("/api/batches")).json()).batches.map((x) => x.id);
    expect(await list()).toEqual(["1", "2"]);
    for (const id of [a, b]) {
      expect((await post(`/api/cards/${id}/pick`, { actor: AI })).status).toBe(200);
      expect((await post(`/api/cards/${id}/status`, { actor: AI, from: "in_progress", to: { state: "review" } })).status).toBe(200);
    }
    expect(await list()).toEqual(["2"]);
    const finished = batchDetailResponse.parse(await (await app.request("/api/batches/1")).json());
    expect(finished.batch.state).toBe("finished");
    expect(boardResponse.parse(await (await app.request("/api/board")).json()).batches.map((x) => x.id)).toEqual(["2"]);
  });

  it("refuses a state filter other than handed or planned", async () => {
    await expectProblem(await app.request("/api/batches?state=finished"), 400, "invalid_request", /handed or planned/);
  });
});

describe("the store's batch checks", () => {
  it("gives batches handed at the same time different numbers", async () => {
    const ids = [await readyCard("a"), await readyCard("b"), await readyCard("c"), await readyCard("d")];
    const input = (n: number, card_ids: string[]) => ({ id: `invented-h${String(n)}`, actor: PO, at: AT, card_ids, handed_to: AI });
    const handed = await Promise.all([handBatch(db, input(1, ids.slice(0, 2))), handBatch(db, input(2, ids.slice(2)))]);
    expect(handed.map((e) => e.batch_id).sort()).toEqual(["1", "2"]);
  });

  it("refuses a batch id already taken, and a card in two batches handed in one write", async () => {
    const ids = [await readyCard("a"), await readyCard("b"), await readyCard("c")];
    const event = (n: number, batch_id: string, card_ids: string[]): StreamEvent => ({
      id: `invented-h${String(n)}`,
      type: "batch_handed",
      actor: PO,
      at: AT,
      batch_id,
      card_ids,
      handed_to: AI,
    });
    await appendEvents(db, [event(1, "1", ids.slice(0, 2))]);
    await expect(appendEvents(db, [event(2, "1", [ids[2]!, "invented-108"])])).rejects.toThrow(/already a batch 1/);
    await expect(appendEvents(db, [event(3, "2", [ids[2]!, "invented-108"]), event(4, "3", [ids[2]!, "invented-108"])])).rejects.toThrow(
      new StoreError(`invented-h4: ${ids[2]!} is already in batch 2, which is not finished`, "conflict"),
    );
    expect((await listBatches(db)).map((b) => b.id)).toEqual(["1"]);
  });
});
