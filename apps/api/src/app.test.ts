// Route tests against an in-memory database loaded with the invented seed.
// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiError,
  boardResponse,
  cardResponse,
  logFiltersResponse,
  streamEvent,
  streamEventType,
  teammateRunResponse,
  writeResponse,
  type StreamEvent,
} from "@workbench/shared";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionDefinitions, loadFunctionIds } from "./process.ts";
import { inventedSeed } from "./seed/invented.ts";
import { withProfile } from "./seed/withProfile.ts";
import { appendEvent, cardStatus, lastSeq, seed, type SeedData } from "./store.ts";

const functionIds = loadFunctionIds();
const PO = "invented-po";
const UX = "invented-ux";
const FE = "invented-fe";
const BE = "invented-be";
const AI = "invented-ai";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = await openDb(":memory:");
  await seed(db, inventedSeed, functionIds);
  let n = 0;
  app = createApp({
    db,
    functionIds,
    now: () => new Date("2026-11-07T10:00:00Z"),
    newId: () => `invented-new-${++n}`,
  });
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

describe("GET /api/health", () => {
  it("answers with the card statuses from the shared package", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, statuses: expect.arrayContaining(["needs_input"]) });
  });
});

describe("GET /api/board", () => {
  it("returns cards with derived status, teammates, open questions, the log and the stream position", async () => {
    const res = await app.request("/api/board");
    expect(res.status).toBe(200);
    const board = boardResponse.parse(await res.json());
    expect(board.cards.map((c) => c.id)).toEqual(inventedSeed.cards.map((c) => c.id).sort());
    expect(board.teammates).toHaveLength(inventedSeed.teammates.length);
    expect(board.cards.find((c) => c.id === "invented-106")?.status).toEqual({
      state: "needs_input",
      waiting_on: PO,
      question_id: "invented-q106",
    });
    expect(board.open_questions.map((q) => q.id)).toEqual(["invented-q106"]);
    // The board carries the latest 50 events; the seed has more.
    expect(board.log.map((e) => e.id)).toEqual(inventedSeed.events.slice(-50).map((e) => e.id));
    expect(board.last_seq).toBe(inventedSeed.events.length);
  });

  it("gives every person their role and no AI teammate one", async () => {
    const board = boardResponse.parse(await (await app.request("/api/board")).json());
    const roles = Object.fromEntries(board.teammates.map((t) => [t.id, t.kind === "human" ? t.role : "none"]));
    expect(roles).toEqual({
      "invented-ai": "none",
      "invented-be": "be",
      "invented-fe": "fe",
      "invented-po": "po",
      "invented-ux": "ux",
    });
  });
});

describe("GET /api/cards/:id", () => {
  it("returns the card, its log and its questions with answers", async () => {
    const res = await app.request("/api/cards/invented-101");
    const detail = cardResponse.parse(await res.json());
    expect(detail.card.status).toEqual({ state: "done" });
    expect(detail.log.every((e) => e.card_id === "invented-101")).toBe(true);
    expect(detail.questions).toEqual([
      expect.objectContaining({ id: "invented-q101a", asked_of: UX, decided_by: UX, answer: expect.any(String) }),
      expect.objectContaining({ id: "invented-q101b", asked_of: UX, decided_by: UX, answer: expect.any(String) }),
    ]);
  });

  // Any seeded card will do; these do not depend on the seed's card ids.
  async function someCardId(): Promise<string> {
    const board = boardResponse.parse(await (await app.request("/api/board")).json());
    return board.cards[0]!.id;
  }

  it("includes the card's function as process/ defines it", async () => {
    const detail = cardResponse.parse(await (await app.request(`/api/cards/${await someCardId()}`)).json());
    expect(detail.function?.name).toBe(detail.card.function_id);
    expect(Object.values(detail.function?.protocols ?? {}).every((p) => p.decides === "human")).toBe(true);
  });

  it("gives a null function when process/ does not define it", async () => {
    const id = await someCardId();
    const other = createApp({ db, functionIds, definitions: new Map() });
    const detail = cardResponse.parse(await (await other.request(`/api/cards/${id}`)).json());
    expect(detail.function).toBeNull();
  });

  it("is 404 for an unknown card", async () => {
    await expectProblem(await app.request("/api/cards/invented-nope"), 404, "not_found", /invented-nope/);
  });
});

describe("POST /api/cards", () => {
  const card = { actor: "invented-po", title: "Invented: a new card", function_id: "frame_problem", owner: UX };

  it("adds a card in backlog", async () => {
    const res = await post("/api/cards", card);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ card: { id: "invented-new-1", status: { state: "backlog" }, links: [] } });
  });

  it("rejects a function that process/ does not have, with 422", async () => {
    await expectProblem(await post("/api/cards", { ...card, function_id: "invented_missing" }), 422, "rule_violation", /invented_missing/);
  });
});

describe("POST /api/cards/:id/pick", () => {
  it("moves a ready card to in_progress in its owner's mode", async () => {
    const res = await post("/api/cards/invented-108/pick", { actor: AI });
    expect(res.status).toBe(200);
    const out = writeResponse.parse(await res.json());
    expect(out.card.status).toEqual({ state: "in_progress" });
    expect(out.events.map((e) => e.type)).toEqual(["picked", "status_changed"]);
    expect(out.events[0]).toMatchObject({ type: "picked", mode: "assist", actor: AI, at: "2026-11-07T10:00:00.000Z" });
  });

  it("refuses a card that depends on a card not done, and appends nothing", async () => {
    // As in step 7 of the history: Robin records Lee's answer, Pat moves the
    // fault-status contract back to Ready, and I-8 (#107) is still open.
    await post("/api/cards/invented-106/questions/invented-q106/answer", { actor: PO, answer: "Invented: a shared form from 2026-10-12." });
    await post("/api/cards/invented-106/status", { actor: BE, from: "in_progress", to: { state: "ready" } });
    const before = await lastSeq(db);
    await expectProblem(await post("/api/cards/invented-106/pick", { actor: BE }), 409, "conflict", /depends on invented-107/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("refuses a mode other than the owner's", async () => {
    await expectProblem(await post("/api/cards/invented-108/pick", { actor: AI, mode: "delegate" }), 422, "rule_violation", /assist/);
  });

  it("refuses a card that is not ready, and appends nothing", async () => {
    const before = await lastSeq(db);
    await expectProblem(await post("/api/cards/invented-104/pick", { actor: AI }), 409, "conflict", /done/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("explains a malformed body", async () => {
    const body = await expectProblem(await post("/api/cards/invented-108/pick", { mode: "assist" }), 400, "invalid_request", /actor/);
    expect(body.issues?.[0]?.path).toBe("actor");
    await expectProblem(await post("/api/cards/invented-108/pick", "{not json", true), 400, "invalid_request", /JSON/);
  });

  it("refuses an unknown actor and an unknown card", async () => {
    await expectProblem(await post("/api/cards/invented-108/pick", { actor: "invented-ghost" }), 422, "rule_violation", /ghost/);
    await expectProblem(await post("/api/cards/invented-nope/pick", { actor: AI }), 404, "not_found");
  });

  describe("when the owner has no mode of their own for the function", () => {
    /** The app over the invented seed with FE's process profile replaced. */
    async function withFeProfile(profile: Record<string, "manual" | "assist" | "delegate">) {
      const data: SeedData = withProfile(inventedSeed, FE, profile);
      const fresh = await openDb(":memory:");
      await seed(fresh, data, functionIds);
      return createApp({ db: fresh, functionIds, definitions, now: () => new Date("2026-11-07T10:00:00Z") });
    }
    const definitions = loadFunctionDefinitions();
    const fallback = definitions.get("refine_ui_spec")!.modes.default;
    const other = definitions.get("refine_ui_spec")!.modes.allowed.find((m) => m !== fallback)!;
    const pick = (a: ReturnType<typeof createApp>, payload: unknown) =>
      a.request("/api/cards/invented-108/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

    it("picks in the function's default mode", async () => {
      const res = await pick(await withFeProfile({}), { actor: FE });
      expect(res.status).toBe(200);
      const out = writeResponse.parse(await res.json());
      expect(out.card.status).toEqual({ state: "in_progress" });
      expect(out.events[0]).toMatchObject({ type: "picked", mode: fallback, actor: FE });
    });

    it("lets an explicit mode win over the default", async () => {
      const res = await pick(await withFeProfile({ refine_ui_spec: other }), { actor: FE });
      expect(res.status).toBe(200);
      expect(writeResponse.parse(await res.json()).events[0]).toMatchObject({ type: "picked", mode: other });
    });

    it("refuses a request mode that differs from the default", async () => {
      const a = await withFeProfile({});
      await expectProblem(await pick(a, { actor: FE, mode: other }), 422, "rule_violation", new RegExp(`worked in ${fallback}`));
    });

    it("refuses a card whose function process/ does not define", async () => {
      const a = createApp({ db, functionIds, definitions: new Map() });
      await expectProblem(await pick(a, { actor: FE }), 422, "rule_violation", /no function 'refine_ui_spec'/);
    });
  });

  it("refuses a card owned by an AI teammate, which has no process profile", async () => {
    await post("/api/cards", { actor: PO, title: "Invented: a card the AI owns", function_id: "refine_ui_spec", owner: AI });
    await post("/api/cards/invented-new-1/status", { actor: PO, from: "backlog", to: { state: "ready" } });
    await expectProblem(await post("/api/cards/invented-new-1/pick", { actor: PO }), 422, "rule_violation", /AI teammate/);
  });
});

describe("POST /api/cards/:id/questions", () => {
  const ask = { actor: AI, asked_of: PO, text: "Invented: who sets up the form?", why_it_blocks: "Invented: it sets the scope." };

  it("asks on a card in progress, which then waits on the person asked", async () => {
    const out = writeResponse.parse(await (await post("/api/cards/invented-107/questions", ask)).json());
    expect(out.events.map((e) => e.type)).toEqual(["asked", "status_changed"]);
    expect(out.card.status).toEqual({ state: "needs_input", waiting_on: PO, question_id: "invented-new-1" });
  });

  it("refuses a card that is not in progress", async () => {
    await expectProblem(await post("/api/cards/invented-108/questions", ask), 409, "conflict", /ready/);
  });
});

describe("POST /api/cards/:id/questions/:questionId/answer", () => {
  const path = "/api/cards/invented-106/questions/invented-q106/answer";

  it("records a human's answer and returns the card to in_progress", async () => {
    const out = writeResponse.parse(await (await post(path, { actor: PO, answer: "Invented: a shared form." })).json());
    expect(out.events.map((e) => e.type)).toEqual(["answered", "status_changed"]);
    expect(out.card.status).toEqual({ state: "in_progress" });
  });

  it("refuses an answer from the AI with 403 and appends nothing, because decides is human", async () => {
    const before = await lastSeq(db);
    await expectProblem(await post(path, { actor: AI, answer: "Invented: a shared form." }), 403, "forbidden", /human/);
    expect(await lastSeq(db)).toBe(before);
    expect((await cardStatus(db, "invented-106")).state).toBe("needs_input");
  });

  it("refuses a second answer and an unknown question", async () => {
    await post(path, { actor: PO, answer: "Invented: a shared form." });
    await expectProblem(await post(path, { actor: PO, answer: "Invented: the spreadsheet." }), 409, "conflict", /already/);
    await expectProblem(
      await post("/api/cards/invented-106/questions/invented-q999/answer", { actor: PO, answer: "x" }),
      404,
      "not_found",
    );
  });
});

describe("POST /api/cards/:id/status", () => {
  it("makes a manual move", async () => {
    const res = await post("/api/cards/invented-108/status", { actor: PO, from: "ready", to: { state: "backlog" } });
    expect(writeResponse.parse(await res.json()).card.status).toEqual({ state: "backlog" });
  });

  it("maps a stale from to 409", async () => {
    await expectProblem(
      await post("/api/cards/invented-104/status", { actor: PO, from: "ready", to: { state: "backlog" } }),
      409,
      "conflict",
      /is done, not ready/,
    );
  });

  it("refuses a move that is not a manual move", async () => {
    await expectProblem(
      await post("/api/cards/invented-108/status", { actor: PO, from: "ready", to: { state: "done" } }),
      422,
      "rule_violation",
      /ready to done/,
    );
  });

  it("refuses needs_input, which only an ask can set", async () => {
    await expectProblem(
      await post("/api/cards/invented-107/status", { actor: PO, from: "in_progress", to: { state: "needs_input" } }),
      400,
      "invalid_request",
    );
  });
});

/** Reads SSE messages from a response body, one at a time. */
function sseReader(res: Response) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(timeoutMs = 2000): Promise<{ id: string; event: StreamEvent }> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (block.startsWith(":")) continue;
          const field = (name: string) =>
            block
              .split("\n")
              .filter((l) => l.startsWith(`${name}: `))
              .map((l) => l.slice(name.length + 2))
              .join("\n");
          return { id: field("id"), event: streamEvent.parse(JSON.parse(field("data"))) };
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("no SSE message in time");
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no SSE message in time")), left)),
        ]);
        if (chunk.done) throw new Error("stream ended");
        buffer += chunk.value;
      }
    },
    close: () => reader.cancel(),
  };
}

describe("GET /api/events", () => {
  it("sends each event appended after connecting once to every client, with its position as id", async () => {
    const a = await app.request("/api/events");
    const b = await app.request("/api/events");
    expect(a.headers.get("Content-Type")).toBe("text/event-stream");
    const ra = sseReader(a);
    const rb = sseReader(b);
    await post("/api/cards/invented-108/pick", { actor: AI });
    const seq = inventedSeed.events.length;
    for (const r of [ra, rb]) {
      const first = await r.next();
      const second = await r.next();
      expect([first.id, second.id]).toEqual([String(seq + 1), String(seq + 2)]);
      expect([first.event.type, second.event.type]).toEqual(["picked", "status_changed"]);
    }
    await Promise.all([ra.close(), rb.close()]);
  });

  it("also streams events written straight to the store, as the AI teammate does", async () => {
    const r = sseReader(await app.request("/api/events"));
    await appendEvent(db, {
      id: "invented-direct",
      type: "report_posted",
      card_id: "invented-107",
      actor: AI,
      at: "2026-11-07T10:00:00Z",
      text: "Invented: a report.",
    });
    expect((await r.next()).event.id).toBe("invented-direct");
    await r.close();
  });

  it("replays the events after Last-Event-ID, then continues live without repeats", async () => {
    const total = inventedSeed.events.length;
    const r = sseReader(await app.request("/api/events", { headers: { "Last-Event-ID": String(total - 2) } }));
    const replayed = [await r.next(), await r.next()];
    expect(replayed.map((m) => m.event.id)).toEqual(inventedSeed.events.slice(-2).map((e) => e.id));
    await post("/api/cards/invented-108/status", { actor: PO, from: "ready", to: { state: "backlog" } });
    const live = await r.next();
    expect(live.id).toBe(String(total + 1));
    expect(live.event.type).toBe("status_changed");
    await r.close();
  });

  it("accepts ?after= as the starting point and rejects a position that is not a number", async () => {
    const r = sseReader(await app.request("/api/events?after=0"));
    expect((await r.next()).event.id).toBe(inventedSeed.events[0]?.id);
    await r.close();
    await expectProblem(await app.request("/api/events", { headers: { "Last-Event-ID": "abc" } }), 400, "invalid_request");
  });

  it("sends a comment at once with nothing to replay, so a proxy passes the headers on", async () => {
    const res = await app.request("/api/events");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no bytes in time")), 1000)),
    ]);
    expect(first.value).toBe(": open\n\n");
    await reader.cancel();
  });
});

describe("POST /api/teammates/:id/run", () => {
  const run = (id: string) => app.request(`/api/teammates/${id}/run`, { method: "POST" });

  it("runs one step: the five events land together, reach SSE clients, and the card waits on its owner", async () => {
    const r = sseReader(await app.request("/api/events"));
    const res = await run(AI);
    expect(res.status).toBe(200);
    const body = teammateRunResponse.parse(await res.json());
    expect(body.card.id).toBe("invented-108");
    expect(body.events.map((e) => e.type)).toEqual(["picked", "status_changed", "report_posted", "asked", "status_changed"]);
    expect(body.events.every((e) => e.actor === AI)).toBe(true);
    const asked = body.events[3];
    if (asked?.type !== "asked") throw new Error("expected asked");
    expect(body.card.status).toEqual({ state: "needs_input", waiting_on: FE, question_id: asked.question_id });

    const seq = inventedSeed.events.length;
    const streamed = [];
    for (let i = 0; i < 5; i++) streamed.push(await r.next());
    expect(streamed.map((m) => m.id)).toEqual([1, 2, 3, 4, 5].map((n) => String(seq + n)));
    expect(streamed.map((m) => m.event.id)).toEqual(body.events.map((e) => e.id));
    await r.close();
  });

  it("answers 409 when no card is eligible, and appends nothing", async () => {
    expect((await run(AI)).status).toBe(200);
    const before = await lastSeq(db);
    await expectProblem(await run(AI), 409, "conflict", /no card it may pick/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("answers 404 for an unknown teammate", async () => {
    await expectProblem(await run("invented-nobody"), 404, "not_found");
  });

  it("answers 422 for a teammate that is not an AI, and appends nothing", async () => {
    const before = await lastSeq(db);
    await expectProblem(await run(BE), 422, "rule_violation", /not an AI/);
    expect(await lastSeq(db)).toBe(before);
    expect((await cardStatus(db, "invented-108")).state).toBe("ready");
  });
});

describe("mode changes as teammate events", () => {
  /** Alex (FE) owns #108, a Ready refine_ui_spec card, and works refine_ui_spec in assist. */
  const setFeMode = (mode: string) => post(`/api/teammates/${FE}/modes`, { actor: FE, function_id: "refine_ui_spec", mode });

  it("the board shows the change in its log and in the person's derived profile", async () => {
    expect((await setFeMode("manual")).status).toBe(200);
    const board = boardResponse.parse(await (await app.request("/api/board")).json());
    const fe = board.teammates.find((t) => t.id === FE);
    expect(fe?.kind === "human" && fe.process_profile).toEqual({ refine_ui_spec: "manual" });
    expect(board.log.at(-1)).toMatchObject({ type: "mode_changed", teammate_id: FE, function_id: "refine_ui_spec", from: "assist", to: "manual" });
    expect(board.last_seq).toBe(inventedSeed.events.length + 1);
  });

  it("reaches SSE clients like a card event", async () => {
    const r = sseReader(await app.request("/api/events"));
    await setFeMode("manual");
    const message = await r.next();
    expect(message.id).toBe(String(inventedSeed.events.length + 1));
    expect(message.event).toMatchObject({ type: "mode_changed", teammate_id: FE, actor: FE, from: "assist", to: "manual" });
    await r.close();
  });

  it("is what a pick uses: the owner's latest mode", async () => {
    await setFeMode("manual");
    const res = await post("/api/cards/invented-108/pick", { actor: FE });
    expect(res.status).toBe(200);
    const body = writeResponse.parse(await res.json());
    expect(body.events[0]).toMatchObject({ type: "picked", mode: "manual" });
  });

  it("is what the AI's eligibility uses: no card once the owner stops working in assist, and one again after", async () => {
    await setFeMode("manual");
    await expectProblem(await app.request(`/api/teammates/${AI}/run`, { method: "POST" }), 409, "conflict", /no card it may pick/);
    await setFeMode("assist");
    const res = await app.request(`/api/teammates/${AI}/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(teammateRunResponse.parse(await res.json()).card.id).toBe("invented-108");
  });
});

describe("POST /api/logs/:log/filter", () => {
  const setFilter = (log: string, actor: string, hidden: unknown) => post(`/api/logs/${log}/filter`, { actor, hidden });
  const board = async () => boardResponse.parse(await (await app.request("/api/board")).json());

  it("every log shows every event type until someone changes its filter", async () => {
    expect((await board()).log_filters).toEqual({ card: [], board: [], cycle: [], teammate: [] });
  });

  it("appends one team event and answers with every log's filter", async () => {
    const res = await setFilter("board", UX, ["mode_changed", "report_posted"]);
    expect(res.status).toBe(200);
    const body = logFiltersResponse.parse(await res.json());
    // Stored in schema order, whatever order the request gave.
    expect(body.log_filters).toEqual({ card: [], board: ["report_posted", "mode_changed"], cycle: [], teammate: [] });
    const after = await board();
    expect(after.log_filters).toEqual(body.log_filters);
    expect(after.log.at(-1)).toEqual({
      id: "invented-new-1",
      type: "log_filter_changed",
      actor: UX,
      at: "2026-11-07T10:00:00.000Z",
      log: "board",
      hidden: ["report_posted", "mode_changed"],
      was_hidden: [],
    });
    expect(after.last_seq).toBe(inventedSeed.events.length + 1);
  });

  it("never filters what the API returns: the board log, the card log and the stream keep every event", async () => {
    await setFilter("board", UX, ["status_changed", "mode_changed"]);
    await setFilter("card", UX, ["status_changed"]);
    const after = await board();
    const expected = [...inventedSeed.events.map((e) => e.id), "invented-new-1", "invented-new-2"].slice(-50);
    expect(after.log.map((e) => e.id)).toEqual(expected);
    const card = cardResponse.parse(await (await app.request("/api/cards/invented-106")).json());
    expect(card.log.some((e) => e.type === "status_changed")).toBe(true);
    const r = sseReader(await app.request("/api/events?after=0"));
    expect((await r.next()).event.id).toBe(inventedSeed.events[0]!.id);
    await r.close();
  });

  it("does not change what the AI teammate reads", async () => {
    await setFilter("board", PO, streamEventType.options);
    await setFilter("teammate", PO, streamEventType.options);
    const res = await app.request(`/api/teammates/${AI}/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(teammateRunResponse.parse(await res.json()).card.id).toBe("invented-108");
  });

  it("reaches SSE clients like any other event", async () => {
    const r = sseReader(await app.request("/api/events"));
    await setFilter("cycle", BE, ["picked"]);
    const message = await r.next();
    expect(message.id).toBe(String(inventedSeed.events.length + 1));
    expect(message.event).toMatchObject({ type: "log_filter_changed", log: "cycle", hidden: ["picked"], was_hidden: [] });
    await r.close();
  });

  it("appends nothing when the log already has that filter, in any order", async () => {
    await setFilter("board", UX, ["picked", "asked"]);
    const res = await setFilter("board", PO, ["asked", "picked"]);
    expect(res.status).toBe(200);
    expect(await lastSeq(db)).toBe(inventedSeed.events.length + 1);
    expect((await setFilter("card", PO, [])).status).toBe(200);
    expect(await lastSeq(db)).toBe(inventedSeed.events.length + 1);
  });

  it("shows everything again when every type is shown, recording what was hidden", async () => {
    await setFilter("board", UX, ["picked"]);
    await setFilter("board", FE, []);
    const after = await board();
    expect(after.log_filters.board).toEqual([]);
    expect(after.log.at(-1)).toMatchObject({ actor: FE, hidden: [], was_hidden: ["picked"] });
  });

  it("refuses an AI actor with 403, an unknown actor with 422 and an unknown log with 404, appending nothing", async () => {
    await expectProblem(await setFilter("board", AI, ["picked"]), 403, "forbidden", /set by a person/);
    await expectProblem(await setFilter("board", "invented-nobody", ["picked"]), 422, "rule_violation");
    await expectProblem(await setFilter("sprint", UX, ["picked"]), 404, "not_found", /no log 'sprint'/);
    expect(await lastSeq(db)).toBe(inventedSeed.events.length);
  });

  it("refuses an unknown event type, a type listed twice and an unknown field with 400", async () => {
    await expectProblem(await setFilter("board", UX, ["comment_added"]), 400, "invalid_request");
    await expectProblem(await setFilter("board", UX, ["picked", "picked"]), 400, "invalid_request");
    await expectProblem(await post("/api/logs/board/filter", { actor: UX, hidden: [], extra: 1 }), 400, "invalid_request");
  });
});
