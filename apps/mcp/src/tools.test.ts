// The MCP tools against the real API: the Hono app from apps/api over an
// in-memory database, reached through its `request` in place of the network,
// so every rule a tool meets is the API's own. The team and cards are invented.
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "@workbench/api/src/app.ts";
import { openDb, type Db } from "@workbench/api/src/db/client.ts";
import { loadFunctionIds } from "@workbench/api/src/process.ts";
import { appendEvents } from "@workbench/api/src/store.ts";
import { enterCards, startTeam, type CardsFile, type TeamFile } from "@workbench/api/src/team/team.ts";
import { WorkbenchClient, type Fetch } from "./client.ts";
import { writeResponse } from "@workbench/shared";
import { createTools, type ToolResult, type Tools } from "./tools.ts";
import { takeMessages, waitForAnswer } from "./wait.ts";

const PERSON = "invented-person";
const AI = "invented-ai";
const BASE = "http://workbench.invalid";

const team: TeamFile = {
  id: "invented",
  name: "Invented team",
  teammates: [
    { kind: "human", id: PERSON, name: "Invented person", roles: ["po", "be"] },
    { kind: "ai", id: AI, name: "Invented AI" },
  ],
  cycle: { id: "invented-cycle", name: "Invented cycle", starts_at: "2026-11-11T00:00:00Z", ends_at: "2026-11-25T00:00:00Z" },
};

const cards: CardsFile = {
  cards: [
    { id: "1", title: "Invented: build the booking rules", function_id: "implement_services", owner: PERSON, links: [] },
    {
      id: "2",
      title: "Invented: build the fault report",
      function_id: "implement_services",
      owner: PERSON,
      links: [{ relation: "depends_on", card_id: "1" }],
    },
  ],
};

let db: Db;
let app: ReturnType<typeof createApp>;
let tools: Tools;

beforeEach(async () => {
  db = await openDb(":memory:");
  const functionIds = loadFunctionIds();
  await startTeam(db, team, "2026-11-11T09:00:00Z");
  await enterCards(db, cards, functionIds);
  app = createApp({ db, functionIds });
  const fetchFn: Fetch = async (input, init) => app.request(input, init);
  tools = createTools({ client: new WorkbenchClient(BASE, fetchFn) });
  // A person opens both cards, as implement_services' protocols require.
  await post("/api/cards/1/status", { actor: PERSON, from: "backlog", to: { state: "ready" } });
  await post("/api/cards/2/status", { actor: PERSON, from: "backlog", to: { state: "ready" } });
});

async function post(path: string, payload: unknown): Promise<Response> {
  const res = await app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`${path}: ${String(res.status)} ${await res.text()}`);
  return res;
}

function text(result: ToolResult): string {
  return result.content.map((c) => c.text).join("\n");
}

/** The JSON a tool answered with; fails the test on a tool error. */
function json(result: ToolResult): Record<string, unknown> {
  if (result.isError) throw new Error(`tool error: ${text(result)}`);
  return JSON.parse(text(result)) as Record<string, unknown>;
}

async function questionOf(cardId: string) {
  const res = await app.request(`/api/cards/${cardId}`);
  return ((await res.json()) as { questions: { id: string; answer?: string }[] }).questions;
}

describe("list_cards and get_card", () => {
  it("lists the board's cards and acts as the board's only AI teammate", async () => {
    const out = json(await tools.list_cards({}));
    expect(out.acting_as).toBe(AI);
    expect(out.cards).toEqual([
      expect.objectContaining({ id: "1", state: "ready", function: "implement_services", owner: PERSON, depends_on: [] }),
      expect.objectContaining({ id: "2", depends_on: ["1"] }),
    ]);
    await tools.pick_card({ card_id: "1" });
    expect((json(await tools.list_cards({ state: "ready" })).cards as unknown[]).length).toBe(1);
  });

  it("reads a card with its function, the owner's mode and what that mode lets the AI do", async () => {
    const out = json(await tools.get_card({ card_id: "1" }));
    expect(out.mode).toBe("delegate");
    expect(out.protocol).toMatchObject({ writes: "ai", decides: "human" });
    expect(out.what_the_ai_does).toMatch(/written by you \(the AI\)/);
    expect(out.function).toMatchObject({ name: "implement_services" });
    expect(out.branch).toBe("wb/1-invented-build-the-booking-rules");
    expect(out.pull_request_body_line).toBe("Workbench: #1");
  });

  it("answers an unknown card as a tool error with the API's reason", async () => {
    const result = await tools.get_card({ card_id: "99" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/HTTP 404 not_found.*no card '99'/);
  });
});

describe("pick_card", () => {
  it("picks a ready card as the AI teammate in the owner's mode", async () => {
    const out = json(await tools.pick_card({ card_id: "1" }));
    expect(out.card).toMatchObject({ id: "1", status: { state: "in_progress" } });
    expect(out.mode).toBe("delegate");
    expect(out.branch).toBe("wb/1-invented-build-the-booking-rules");
  });

  it("surfaces the API's refusal of a card whose dependency is not done", async () => {
    const result = await tools.pick_card({ card_id: "2" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/HTTP 409 conflict\): 2 depends on 1, which is not done/);
  });

  it("surfaces the API's refusal of a card the owner works in manual", async () => {
    await post(`/api/teammates/${PERSON}/modes`, { actor: PERSON, function_id: "implement_services", mode: "manual" });
    const result = await tools.pick_card({ card_id: "1" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/HTTP 422 rule_violation\): invented-ai may not pick 1: .*'manual'/);
  });

  it("acts as WORKBENCH_ACTOR when it is set", async () => {
    const fetchFn: Fetch = async (input, init) => app.request(input, init);
    const asPerson = createTools({ client: new WorkbenchClient(BASE, fetchFn), actor: PERSON });
    json(await asPerson.pick_card({ card_id: "1" }));
    const log = json(await tools.get_card({ card_id: "1" })).log as { type: string; actor: string }[];
    expect(log.find((e) => e.type === "picked")?.actor).toBe(PERSON);
  });
});

describe("ask_question and wait_for_answer", () => {
  const ask = { card_id: "1", text: "Invented: may a household book two slots in a row?", why_it_blocks: "Invented: it decides the booking rule." };

  it("asks the card's owner, and on a timeout returns the question to wait on again", async () => {
    await tools.pick_card({ card_id: "1" });
    const out = json(await tools.ask_question({ ...ask, wait_seconds: 0 }));
    expect(out.answered).toBe(false);
    const question = out.question as { id: string; asked_of: string; answer: unknown };
    expect(question).toMatchObject({ asked_of: PERSON, answer: null });
    expect(out.next).toMatch(new RegExp(`No answer within 0 seconds.*wait_for_answer.*"${question.id}"`));
    const card = json(await tools.get_card({ card_id: "1" })).card;
    expect(card).toMatchObject({ status: { state: "needs_input", waiting_on: PERSON, question_id: question.id } });
  });

  it("returns the answer when the person answers while it waits", async () => {
    await tools.pick_card({ card_id: "1" });
    const pending = tools.ask_question({ ...ask, wait_seconds: 10 });
    // Answer once the question is on the card, as a person on the board would.
    let id: string | undefined;
    while (id === undefined) {
      await new Promise((r) => setTimeout(r, 10));
      id = (await questionOf("1"))[0]?.id;
    }
    await post(`/api/cards/1/questions/${id}/answer`, { actor: PERSON, answer: "Invented: no, one slot at a time." });
    const out = json(await pending);
    expect(out.answered).toBe(true);
    expect(out.question).toMatchObject({ id, answer: "Invented: no, one slot at a time.", decided_by: PERSON });
  });

  it("returns at once for a question already answered, and keeps waiting on one that is not", async () => {
    await tools.pick_card({ card_id: "1" });
    const asked = json(await tools.ask_question({ ...ask, wait_seconds: 0 }));
    const id = (asked.question as { id: string }).id;
    const again = json(await tools.wait_for_answer({ card_id: "1", question_id: id, wait_seconds: 0 }));
    expect(again.answered).toBe(false);
    await post(`/api/cards/1/questions/${id}/answer`, { actor: PERSON, answer: "Invented: yes." });
    const started = Date.now();
    const done = json(await tools.wait_for_answer({ card_id: "1", question_id: id, wait_seconds: 30 }));
    expect(done.answered).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("surfaces a question asked on a card nobody is working on as a tool error", async () => {
    const result = await tools.ask_question({ ...ask, wait_seconds: 0 });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/HTTP 409 conflict\): 1 is ready; questions are asked on a card in progress/);
  });

  it("surfaces an unknown question as a tool error", async () => {
    const result = await tools.wait_for_answer({ card_id: "1", question_id: "invented-nope", wait_seconds: 0 });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/no question 'invented-nope' on 1/);
  });
});

describe("post_report", () => {
  it("posts a report on the card the AI works", async () => {
    await tools.pick_card({ card_id: "1" });
    const out = json(await tools.post_report({ card_id: "1", text: "Invented: the booking rules are in, with tests." }));
    expect(out.events).toEqual([expect.objectContaining({ type: "report_posted", actor: AI, text: "Invented: the booking rules are in, with tests." })]);
  });

  it("surfaces a report on a card nobody works on as a tool error", async () => {
    const result = await tools.post_report({ card_id: "1", text: "Invented." });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/409 conflict\): 1 is ready/);
  });
});

describe("link_branch", () => {
  it("suggests the branch and the body line, and records nothing", async () => {
    const before = json(await tools.get_card({ card_id: "1" })).log as unknown[];
    const out = json(await tools.link_branch({ card_id: "1" }));
    expect(out).toMatchObject({ branch: "wb/1-invented-build-the-booking-rules", linked_on_board: false, linked_branches: [], pull_request_body_line: "Workbench: #1" });
    expect(json(await tools.get_card({ card_id: "1" })).log).toEqual(before);
  });

  it("says when the board has seen the branch through the webhook", async () => {
    await appendEvents(db, [
      {
        id: "invented-link",
        type: "workspace_linked",
        card_id: "1",
        actor: AI,
        at: "2026-11-11T10:00:00Z",
        workspace: "github",
        repository: "invented/repo",
        branch: "wb/1-booking",
        url: "https://github.com/invented/repo/tree/wb/1-booking",
      },
    ]);
    const out = json(await tools.link_branch({ card_id: "1", branch: "wb/1-booking" }));
    expect(out).toMatchObject({ branch: "wb/1-booking", linked_on_board: true });
  });

  it("refuses a branch that names another card or none", async () => {
    expect(text(await tools.link_branch({ card_id: "1", branch: "wb/2-booking" }))).toMatch(/names card 2; a branch for card 1 is named wb\/1-/);
    const result = await tools.link_branch({ card_id: "1", branch: "feature/booking" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/names no card/);
  });
});

describe("when the API is down", () => {
  it("says so as a tool error", async () => {
    const down = createTools({
      client: new WorkbenchClient(BASE, () => Promise.reject(new TypeError("fetch failed"))),
    });
    const result = await down.list_cards({});
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/did not answer \(fetch failed\); is team:serve running\?/);
  });
});

describe("when a step after a write fails", () => {
  /** Tools whose fetch fails for the paths `broken` matches, and reaches the API otherwise. */
  function toolsFailing(broken: (url: string, init?: RequestInit) => boolean): Tools {
    const fetchFn: Fetch = async (input, init) => (broken(input, init) ? Promise.reject(new TypeError("fetch failed")) : app.request(input, init));
    return createTools({ client: new WorkbenchClient(BASE, fetchFn) });
  }

  it("returns the question id when the ask succeeds but the wait fails, so the session does not ask twice", async () => {
    await tools.pick_card({ card_id: "1" });
    const flaky = toolsFailing((url) => url.endsWith("/api/events"));
    const result = await flaky.ask_question({ card_id: "1", text: "Invented: one slot or two?", why_it_blocks: "Invented: it sets the rule.", wait_seconds: 5 });
    const out = json(result);
    const id = (out.question as { id: string }).id;
    expect(out.answered).toBe(false);
    expect(out.next).toMatch(new RegExp(`waiting for the answer failed .*Do not ask again: call wait_for_answer .*"${id}"`));
    expect((await questionOf("1")).map((q) => q.id)).toEqual([id]);
  });

  it("reads the card before picking, so a failed read leaves the card unpicked", async () => {
    const flaky = toolsFailing((url, init) => url.endsWith("/api/cards/1") && (init?.method ?? "GET") === "GET");
    expect((await flaky.pick_card({ card_id: "1" })).isError).toBe(true);
    expect(json(await tools.get_card({ card_id: "1" })).card).toMatchObject({ status: { state: "ready" } });
    expect(json(await tools.pick_card({ card_id: "1" })).mode).toBe("delegate");
  });
});

describe("waitForAnswer", () => {
  it("skips a stream message that is not JSON and still finds the answer", async () => {
    await tools.pick_card({ card_id: "1" });
    const asked = json(await tools.ask_question({ card_id: "1", text: "Invented: q?", why_it_blocks: "Invented: w.", wait_seconds: 0 }));
    const id = (asked.question as { id: string }).id;
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": open\n\nid: 90\ndata: {not json\n\n"));
      },
      // The second read comes after the wait has checked the card, so the answer is given now.
      async pull(controller) {
        if (++pulls < 2) return;
        const res = await post(`/api/cards/1/questions/${id}/answer`, { actor: PERSON, answer: "Invented: one." });
        const answered = writeResponse.parse(await res.json()).events[0];
        controller.enqueue(encoder.encode(`id: 91\ndata: ${JSON.stringify(answered)}\n\n`));
      },
    });
    const fetchFn: Fetch = async (input, init) => (input.endsWith("/api/events") ? new Response(stream) : app.request(input, init));
    const result = await waitForAnswer(new WorkbenchClient(BASE, fetchFn), "1", id, { timeoutMs: 5000 });
    expect(result).toMatchObject({ answered: true, question: { id, answer: "Invented: one." } });
  });
});

describe("takeMessages", () => {
  it("reads the data of complete SSE messages and keeps the rest", () => {
    const { data, rest } = takeMessages(': open\n\nid: 4\ndata: {"a":1}\n\nid: 5\ndata: {"b"');
    expect(data).toEqual(['{"a":1}']);
    expect(rest).toBe('id: 5\ndata: {"b"');
  });
});
