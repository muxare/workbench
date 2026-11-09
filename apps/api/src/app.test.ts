// Route tests against an in-memory database loaded with the invented seed.
// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import { apiError, boardResponse, cardEvent, cardResponse, writeResponse, type CardEvent } from "@workbench/shared";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";
import { inventedSeed } from "./seed/invented.ts";
import { appendEvent, cardStatus, lastSeq, seed } from "./store.ts";

const functionIds = loadFunctionIds();
const UX = "invented-ux";
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
    expect(board.cards.find((c) => c.id === "invented-151")?.status).toEqual({
      state: "needs_input",
      waiting_on: BE,
      question_id: "invented-q151",
    });
    expect(board.open_questions.map((q) => q.id)).toEqual(["invented-q151"]);
    expect(board.log.map((e) => e.id)).toEqual(inventedSeed.events.map((e) => e.id));
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
    const res = await app.request("/api/cards/invented-142");
    const detail = cardResponse.parse(await res.json());
    expect(detail.card.status).toEqual({ state: "in_progress" });
    expect(detail.log.every((e) => e.card_id === "invented-142")).toBe(true);
    expect(detail.questions).toEqual([
      expect.objectContaining({ id: "invented-q142", asked_of: UX, decided_by: UX, answer: expect.any(String) }),
    ]);
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
    const res = await post("/api/cards/invented-154/pick", { actor: AI });
    expect(res.status).toBe(200);
    const out = writeResponse.parse(await res.json());
    expect(out.card.status).toEqual({ state: "in_progress" });
    expect(out.events.map((e) => e.type)).toEqual(["picked", "status_changed"]);
    expect(out.events[0]).toMatchObject({ type: "picked", mode: "assist", actor: AI, at: "2026-11-07T10:00:00.000Z" });
  });

  it("refuses a card that depends on a card not done, and appends nothing", async () => {
    const before = await lastSeq(db);
    await expectProblem(await post("/api/cards/invented-152/pick", { actor: AI }), 409, "conflict", /depends on invented-151/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("refuses a mode other than the owner's", async () => {
    await expectProblem(await post("/api/cards/invented-154/pick", { actor: AI, mode: "delegate" }), 422, "rule_violation", /assist/);
  });

  it("refuses a card that is not ready, and appends nothing", async () => {
    const before = await lastSeq(db);
    await expectProblem(await post("/api/cards/invented-153/pick", { actor: AI }), 409, "conflict", /backlog/);
    expect(await lastSeq(db)).toBe(before);
  });

  it("explains a malformed body", async () => {
    const body = await expectProblem(await post("/api/cards/invented-154/pick", { mode: "assist" }), 400, "invalid_request", /actor/);
    expect(body.issues?.[0]?.path).toBe("actor");
    await expectProblem(await post("/api/cards/invented-154/pick", "{not json", true), 400, "invalid_request", /JSON/);
  });

  it("refuses an unknown actor and an unknown card", async () => {
    await expectProblem(await post("/api/cards/invented-154/pick", { actor: "invented-ghost" }), 422, "rule_violation", /ghost/);
    await expectProblem(await post("/api/cards/invented-nope/pick", { actor: AI }), 404, "not_found");
  });
});

describe("POST /api/cards/:id/questions", () => {
  const ask = { actor: AI, asked_of: UX, text: "Invented: which flow first?", why_it_blocks: "Invented: it sets the scope." };

  it("asks on a card in progress, which then waits on the person asked", async () => {
    const out = writeResponse.parse(await (await post("/api/cards/invented-142/questions", ask)).json());
    expect(out.events.map((e) => e.type)).toEqual(["asked", "status_changed"]);
    expect(out.card.status).toEqual({ state: "needs_input", waiting_on: UX, question_id: "invented-new-1" });
  });

  it("refuses a card that is not in progress", async () => {
    await expectProblem(await post("/api/cards/invented-152/questions", ask), 409, "conflict", /ready/);
  });
});

describe("POST /api/cards/:id/questions/:questionId/answer", () => {
  const path = "/api/cards/invented-151/questions/invented-q151/answer";

  it("records a human's answer and returns the card to in_progress", async () => {
    const out = writeResponse.parse(await (await post(path, { actor: BE, answer: "Invented: a cursor." })).json());
    expect(out.events.map((e) => e.type)).toEqual(["answered", "status_changed"]);
    expect(out.card.status).toEqual({ state: "in_progress" });
  });

  it("refuses an answer from the AI with 403 and appends nothing, because decides is human", async () => {
    const before = await lastSeq(db);
    await expectProblem(await post(path, { actor: AI, answer: "Invented: a cursor." }), 403, "forbidden", /human/);
    expect(await lastSeq(db)).toBe(before);
    expect((await cardStatus(db, "invented-151")).state).toBe("needs_input");
  });

  it("refuses a second answer and an unknown question", async () => {
    await post(path, { actor: BE, answer: "Invented: a cursor." });
    await expectProblem(await post(path, { actor: BE, answer: "Invented: pages." }), 409, "conflict", /already/);
    await expectProblem(
      await post("/api/cards/invented-151/questions/invented-q999/answer", { actor: BE, answer: "x" }),
      404,
      "not_found",
    );
  });
});

describe("POST /api/cards/:id/status", () => {
  it("makes a manual move", async () => {
    const res = await post("/api/cards/invented-145/status", { actor: "invented-fe", from: "review", to: { state: "done" } });
    expect(writeResponse.parse(await res.json()).card.status).toEqual({ state: "done" });
  });

  it("maps a stale from to 409", async () => {
    await expectProblem(
      await post("/api/cards/invented-153/status", { actor: "invented-po", from: "ready", to: { state: "backlog" } }),
      409,
      "conflict",
      /is backlog, not ready/,
    );
  });

  it("refuses a move that is not a manual move", async () => {
    await expectProblem(
      await post("/api/cards/invented-153/status", { actor: "invented-po", from: "backlog", to: { state: "done" } }),
      422,
      "rule_violation",
      /backlog to done/,
    );
  });

  it("refuses needs_input, which only an ask can set", async () => {
    await expectProblem(
      await post("/api/cards/invented-142/status", { actor: UX, from: "in_progress", to: { state: "needs_input" } }),
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
    async next(timeoutMs = 2000): Promise<{ id: string; event: CardEvent }> {
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
          return { id: field("id"), event: cardEvent.parse(JSON.parse(field("data"))) };
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
    await post("/api/cards/invented-154/pick", { actor: AI });
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
      card_id: "invented-147",
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
    await post("/api/cards/invented-145/status", { actor: "invented-fe", from: "review", to: { state: "done" } });
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
