// The GitHub webhook endpoint against recorded payloads (./fixtures), trimmed
// from the shapes in GitHub's webhook reference. Ids, shas, run numbers and
// the bot account workbench-agent[bot] in them are invented.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { apiError, webhookResponse, type CardEvent } from "@workbench/shared";
import { createApp } from "../app.ts";
import { openDb, type Db } from "../db/client.ts";
import { loadFunctionIds } from "../process.ts";
import { addCard, addTeammate, appendEvents, cardLog, cardStatus } from "../store.ts";
import { formatGithubLogins, parseGithubLogins } from "./logins.ts";
import { signBody, validSignature } from "./signature.ts";
import { eventIdFor } from "./webhook.ts";

const SECRET = "invented-webhook-secret";
const NOW = "2026-11-11T12:00:00.000Z";
const LOGINS = parseGithubLogins("muxare=mikael,workbench-agent[bot]=ai");

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as Record<string, unknown>;
}

/** A copy of `payload` with the value at a dotted path replaced. */
function tweak(payload: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const copy = structuredClone(payload);
  const keys = path.split(".");
  let at: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) at = at[key] as Record<string, unknown>;
  at[keys.at(-1)!] = value;
  return copy;
}

let db: Db;
let app: ReturnType<typeof createApp>;
let deliveries = 0;

beforeEach(async () => {
  db = await openDb(":memory:");
  await addTeammate(db, { kind: "human", id: "mikael", name: "Mikael (invented test team)", roles: ["po", "be"] }, "2026-11-11T08:00:00Z");
  await addTeammate(db, { kind: "ai", id: "ai", name: "AI teammate" });
  const functionIds = loadFunctionIds();
  for (const id of ["1", "2"]) {
    await addCard(db, { id, title: `Invented card ${id}`, function_id: "implement_services", owner: "mikael", links: [] }, functionIds);
  }
  app = createApp({ db, functionIds, now: () => new Date(NOW), githubWebhookSecret: SECRET, githubLogins: LOGINS });
});

/** Move card 2 through the given states, as Mikael. */
async function moveCard2(...states: ("ready" | "in_progress" | "review" | "done")[]) {
  let from = (await cardStatus(db, "2")).state;
  const events: CardEvent[] = [];
  for (const [i, to] of states.entries()) {
    events.push({ id: `move-${String(i)}-${to}`, type: "status_changed", card_id: "2", actor: "mikael", at: "2026-11-11T09:00:00Z", from, to: { state: to } });
    from = to;
  }
  await appendEvents(db, events);
}

/** Mikael's mode for implement_services, the function of cards 1 and 2; its default is delegate. */
async function setMode(to: "manual" | "assist" | "delegate") {
  await appendEvents(db, [
    { id: `invented-mode-${to}`, type: "mode_changed", teammate_id: "mikael", function_id: "implement_services", actor: "mikael", at: "2026-11-11T08:30:00Z", from: null, to },
  ]);
}

/** Require the AI critic to pass before a person's approval leads to done, for implement_services. */
async function requireCritic() {
  await appendEvents(db, [
    { id: "invented-gate", type: "critic_gate_changed", function_id: "implement_services", actor: "mikael", at: "2026-11-11T08:30:00Z", required: true, was_required: false },
  ]);
}

/** A review of pull request #3 submitted by the AI teammate, the AI critic. */
const criticReview = (state: "approved" | "commented" | "changes_requested") =>
  tweak(tweak(fixture("pull_request_review.approved"), "review.user.login", "workbench-agent[bot]"), "review.state", state);

interface DeliverOptions {
  delivery?: string;
  signature?: string | null;
  body?: string;
  contentType?: string;
}

function deliver(event: string, payload: unknown, options: DeliverOptions = {}) {
  const body = options.body ?? JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    "x-github-event": event,
    "x-github-delivery": options.delivery ?? `invented-delivery-${String(++deliveries)}`,
  };
  const signature = options.signature === undefined ? signBody(SECRET, body) : options.signature;
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  return app.request("/api/github/webhook", { method: "POST", headers, body });
}

async function outcome(res: Response) {
  expect(res.status).toBe(200);
  return webhookResponse.parse(await res.json());
}

async function recorded(event: string, payload: unknown) {
  const body = await outcome(await deliver(event, payload));
  expect(body.outcome, body.reason).toBe("recorded");
  return body;
}

async function ignored(event: string, payload: unknown, reason: RegExp) {
  const before = (await cardLog(db, "2")).length;
  const body = await outcome(await deliver(event, payload));
  expect(body.outcome).toBe("ignored");
  expect(body.reason).toMatch(reason);
  expect(body.events).toEqual([]);
  expect(await cardLog(db, "2")).toHaveLength(before);
  return body;
}

const types = (events: readonly CardEvent[]) => events.map((e) => e.type);

describe("the signature", () => {
  it("signs as GitHub documents: sha256= and the hex HMAC of the body", () => {
    // The example from GitHub's "Validating webhook deliveries".
    expect(signBody("It's a Secret to Everybody", "Hello, World!")).toBe(
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
    expect(validSignature("s", "body", signBody("s", "body"))).toBe(true);
    expect(validSignature("s", "body", signBody("other", "body"))).toBe(false);
    expect(validSignature("s", "body", undefined)).toBe(false);
  });

  it("rejects a delivery with a wrong or missing signature with 401 and records nothing", async () => {
    for (const signature of [signBody("not-the-secret", JSON.stringify(fixture("push.created"))), "sha256=00", null]) {
      const res = await deliver("push", fixture("push.created"), { signature });
      expect(res.status).toBe(401);
      expect(apiError.parse(await res.json()).error).toBe("unauthorized");
    }
    expect(await cardLog(db, "2")).toEqual([]);
  });

  it("rejects a body changed after signing", async () => {
    const signature = signBody(SECRET, JSON.stringify(fixture("push.created")));
    const res = await deliver("push", fixture("push"), { signature });
    expect(res.status).toBe(401);
  });

  it("answers 503 when no secret is configured", async () => {
    app = createApp({ db, functionIds: loadFunctionIds(), githubLogins: LOGINS });
    const res = await deliver("push", fixture("push.created"));
    expect(res.status).toBe(503);
    expect(apiError.parse(await res.json()).error).toBe("unavailable");
  });
});

describe("dispatch", () => {
  it("ignores an event it does not map, such as ping, with 200", async () => {
    await ignored("ping", fixture("ping"), /ping event is not mapped/);
  });

  it("requires X-GitHub-Event and X-GitHub-Delivery", async () => {
    const body = JSON.stringify(fixture("ping"));
    const res = await app.request("/api/github/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signBody(SECRET, body) },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("answers 400 for a payload without GitHub's shape", async () => {
    const res = await deliver("push", { ref: "refs/heads/wb/2-x" });
    expect(res.status).toBe(400);
    expect(apiError.parse(await res.json()).reason).toMatch(/push payload/);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await deliver("push", undefined, { body: "not json" });
    expect(res.status).toBe(400);
  });

  it("reads a webhook set to send a form, with the JSON in payload", async () => {
    const body = new URLSearchParams({ payload: JSON.stringify(fixture("push.created")) }).toString();
    const res = await deliver("push", undefined, { body, contentType: "application/x-www-form-urlencoded" });
    expect((await outcome(res)).outcome).toBe("recorded");
  });

  it("records a redelivery once, by X-GitHub-Delivery", async () => {
    const first = await outcome(await deliver("push", fixture("push.created"), { delivery: "invented-guid" }));
    expect(first.events.map((e) => e.id)).toEqual([eventIdFor("invented-guid", 0), eventIdFor("invented-guid", 1)]);
    const again = await outcome(await deliver("push", fixture("push.created"), { delivery: "invented-guid" }));
    expect(again.outcome).toBe("duplicate");
    expect(again.events).toEqual([]);
    expect(await cardLog(db, "2")).toHaveLength(2);
  });
});

describe("push", () => {
  it("links the branch the first time, with the commits the push carried", async () => {
    const body = await recorded("push", fixture("push.created"));
    expect(body.card_id).toBe("2");
    expect(body.events).toEqual([
      {
        id: expect.any(String),
        type: "workspace_linked",
        card_id: "2",
        actor: "ai",
        at: NOW,
        workspace: "github",
        repository: "muxare/workbench",
        branch: "wb/2-github-webhooks",
        url: "https://github.com/muxare/workbench/tree/wb/2-github-webhooks",
      },
      {
        id: expect.any(String),
        type: "work_pushed",
        card_id: "2",
        actor: "ai",
        at: NOW,
        branch: "wb/2-github-webhooks",
        head_sha: "5a1c0e7d3b9f24a6c8e1d0f3b7a2c4e6d8f0a1b2",
        commits: 1,
        forced: false,
        url: "https://github.com/muxare/workbench/commit/5a1c0e7d3b9f",
      },
    ]);
    expect(await cardLog(db, "2")).toEqual(body.events);
  });

  it("links a branch made on GitHub with no commits, and records no push", async () => {
    const body = await recorded("push", tweak(fixture("push.created"), "commits", []));
    expect(types(body.events)).toEqual(["workspace_linked"]);
  });

  it("records later pushes as work_pushed only", async () => {
    await recorded("push", fixture("push.created"));
    const body = await recorded("push", fixture("push"));
    expect(body.events).toMatchObject([{ type: "work_pushed", commits: 2, head_sha: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d" }]);
  });

  it("links a branch whose first push the board missed when the next push comes", async () => {
    const body = await recorded("push", fixture("push"));
    expect(types(body.events)).toEqual(["workspace_linked", "work_pushed"]);
  });

  it("ignores a push with no commits to a branch already linked", async () => {
    await recorded("push", fixture("push.created"));
    await ignored("push", tweak(tweak(fixture("push"), "commits", []), "forced", true), /carried no commits/);
  });

  it("records a forced push as forced", async () => {
    await recorded("push", fixture("push.created"));
    const body = await recorded("push", tweak(fixture("push"), "forced", true));
    expect(body.events).toMatchObject([{ type: "work_pushed", forced: true }]);
  });

  it("does not move the card's status", async () => {
    await moveCard2("ready", "in_progress");
    await recorded("push", fixture("push.created"));
    expect((await cardStatus(db, "2")).state).toBe("in_progress");
  });

  it("ignores tags, main, deleted branches, branches naming no card and cards not on the board", async () => {
    await ignored("push", tweak(fixture("push"), "ref", "refs/tags/v0.1.0"), /is not a branch/);
    await ignored("push", tweak(fixture("push"), "ref", "refs/heads/main"), /branch main names no card/);
    await ignored("push", tweak(fixture("push"), "ref", "refs/heads/feature/2-x"), /names no card/);
    await ignored("push", tweak(fixture("push"), "deleted", true), /was deleted/);
    const missing = await ignored("push", tweak(fixture("push"), "ref", "refs/heads/wb/99-not-here"), /card 99 is not on the board/);
    expect(missing.card_id).toBe("99");
  });

  it("ignores a push by a GitHub account that is not a teammate", async () => {
    await ignored("push", tweak(fixture("push"), "sender.login", "invented-stranger"), /invented-stranger is not mapped to a teammate/);
  });
});

describe("pull_request opened or ready for review", () => {
  it("asks for review and moves a card in progress to review", async () => {
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", fixture("pull_request.opened"));
    expect(body.events).toMatchObject([
      { type: "review_requested", actor: "ai", pull_request: 3, title: "feat(api): GitHub webhook endpoint", url: "https://github.com/muxare/workbench/pull/3" },
      { type: "status_changed", actor: "ai", from: "in_progress", to: { state: "review" } },
    ]);
    expect((await cardStatus(db, "2")).state).toBe("review");
  });

  it("asks for review again when a reviewer is re-requested", async () => {
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", fixture("pull_request.review_requested"));
    expect(body.events).toMatchObject([
      { type: "review_requested", pull_request: 3 },
      { type: "status_changed", from: "in_progress", to: { state: "review" } },
    ]);
  });

  it("refuses with 200 when the card moved while the delivery was handled", async () => {
    await moveCard2("ready", "in_progress");
    // The clock is read after the delivery is planned and before it is written. Writes to one database run in
    // order, so a move queued here lands first, and the planned move from in_progress is stale.
    let moved: Promise<unknown> | undefined;
    app = createApp({
      db,
      functionIds: loadFunctionIds(),
      githubWebhookSecret: SECRET,
      githubLogins: LOGINS,
      now: () => {
        moved ??= appendEvents(db, [
          { id: "invented-move-back", type: "status_changed", card_id: "2", actor: "mikael", at: NOW, from: "in_progress", to: { state: "ready" } },
        ]);
        return new Date(NOW);
      },
    });
    const body = await outcome(await deliver("pull_request", fixture("pull_request.opened")));
    await moved;
    expect(body.outcome).toBe("refused");
    expect(body.reason).toMatch(/card 2 moved while the delivery was handled/);
    expect(types(await cardLog(db, "2"))).not.toContain("review_requested");
    expect((await cardStatus(db, "2")).state).toBe("ready");
  });

  it("asks for review without a move when the card is not in progress", async () => {
    const body = await recorded("pull_request", fixture("pull_request.opened"));
    expect(types(body.events)).toEqual(["review_requested"]);
    expect((await cardStatus(db, "2")).state).toBe("backlog");
  });

  it("finds the card from the body when the branch does not name it", async () => {
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", fixture("pull_request.ready_for_review"));
    expect(body.card_id).toBe("2");
    expect(body.events).toMatchObject([{ type: "review_requested", pull_request: 4 }, { type: "status_changed", to: { state: "review" } }]);
  });

  it("takes the body's card over the branch's when they differ", async () => {
    const payload = tweak(fixture("pull_request.opened"), "pull_request.body", "Workbench: #1");
    expect((await recorded("pull_request", payload)).card_id).toBe("1");
  });

  it("ignores a draft, other actions, and a pull request naming no card", async () => {
    await ignored("pull_request", tweak(fixture("pull_request.opened"), "pull_request.draft", true), /opened as a draft/);
    await ignored("pull_request", tweak(fixture("pull_request.opened"), "action", "synchronize"), /synchronize is not mapped/);
    const unnamed = tweak(tweak(fixture("pull_request.opened"), "pull_request.body", "No card."), "pull_request.head.ref", "tidy-up");
    await ignored("pull_request", unnamed, /pull request #3 names no card/);
  });

  it("falls back to the branch when the body is empty", async () => {
    expect((await recorded("pull_request", tweak(fixture("pull_request.opened"), "pull_request.body", null))).card_id).toBe("2");
  });
});

describe("workflow_run of check", () => {
  it("records a passed structural check for a successful run on the card's pull request", async () => {
    const body = await recorded("workflow_run", fixture("workflow_run.completed"));
    expect(body.events).toEqual([
      {
        id: expect.any(String),
        type: "check_ran",
        card_id: "2",
        actor: "ai",
        at: NOW,
        check: "structural",
        passed: true,
        summary: "The check workflow, run 2, ended success on pull request #3.",
        url: "https://github.com/muxare/workbench/actions/runs/43020000001",
        pull_request: 3,
      },
    ]);
  });

  it("records a failed, timed-out, failed-to-start and action-needing run as failed checks", async () => {
    for (const conclusion of ["failure", "timed_out", "startup_failure", "action_required"]) {
      const body = await recorded("workflow_run", tweak(fixture("workflow_run.completed"), "workflow_run.conclusion", conclusion));
      expect(body.events).toMatchObject([{ type: "check_ran", passed: false }]);
    }
  });

  it("finds the card through the pull request's review_requested when the branch does not name it", async () => {
    await recorded("pull_request", fixture("pull_request.ready_for_review"));
    let run = tweak(fixture("workflow_run.completed"), "workflow_run.head_branch", "github-webhooks");
    run = tweak(run, "workflow_run.pull_requests", [{ number: 4, head: { ref: "github-webhooks" } }]);
    expect((await recorded("workflow_run", run)).card_id).toBe("2");
  });

  it("takes the pull request's card over the branch's", async () => {
    const functionIds = loadFunctionIds();
    for (const id of ["3", "5"]) {
      await addCard(db, { id, title: `Invented card ${id}`, function_id: "implement_services", owner: "mikael", links: [] }, functionIds);
    }
    const opened = tweak(tweak(fixture("pull_request.opened"), "pull_request.head.ref", "wb/3-misnamed"), "pull_request.body", "Workbench: #5");
    expect((await recorded("pull_request", opened)).card_id).toBe("5");
    let run = tweak(fixture("workflow_run.completed"), "workflow_run.head_branch", "wb/3-misnamed");
    run = tweak(run, "workflow_run.pull_requests", [{ number: 3, head: { ref: "wb/3-misnamed" } }]);
    expect((await recorded("workflow_run", run)).card_id).toBe("5");
  });

  it("skips neutral, cancelled, skipped, stale and unknown conclusions, runs on main, runs off a pull request, other workflows and unfinished runs", async () => {
    for (const conclusion of ["neutral", "cancelled", "skipped", "stale", "invented_new_conclusion"]) {
      await ignored("workflow_run", tweak(fixture("workflow_run.completed"), "workflow_run.conclusion", conclusion), new RegExp(`ended ${conclusion}`));
    }
    const onMain = tweak(tweak(fixture("workflow_run.completed"), "workflow_run.head_branch", "main"), "workflow_run.event", "push");
    await ignored("workflow_run", onMain, /is on main/);
    await ignored("workflow_run", tweak(fixture("workflow_run.completed"), "workflow_run.pull_requests", []), /not on a pull request/);
    await ignored("workflow_run", tweak(fixture("workflow_run.completed"), "workflow_run.name", "deploy"), /deploy is not the structural check/);
    await ignored("workflow_run", tweak(fixture("workflow_run.completed"), "action", "in_progress"), /only a completed run/);
  });
});

describe("pull_request_review", () => {
  it("records an approval by the reviewer", async () => {
    const body = await recorded("pull_request_review", fixture("pull_request_review.approved"));
    expect(body.events).toEqual([
      {
        id: expect.any(String),
        type: "approved",
        card_id: "2",
        actor: "mikael",
        at: NOW,
        pull_request: 3,
        url: "https://github.com/muxare/workbench/pull/3#pullrequestreview-900000020",
        commit_sha: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d",
      },
    ]);
  });

  it("records changes requested with the review's text and sends a card in review back to in progress", async () => {
    await moveCard2("ready", "in_progress", "review");
    const body = await recorded("pull_request_review", fixture("pull_request_review.changes_requested"));
    expect(body.events).toMatchObject([
      { type: "changes_requested", actor: "mikael", pull_request: 3, text: "Skip cancelled runs too, not only failed ones." },
      { type: "status_changed", actor: "mikael", from: "review", to: { state: "in_progress" } },
    ]);
    expect((await cardStatus(db, "2")).state).toBe("in_progress");
  });

  it("ignores a comment review, from a person or the AI critic, and other review actions", async () => {
    await ignored("pull_request_review", tweak(fixture("pull_request_review.approved"), "review.state", "commented"), /commented review is not mapped/);
    await ignored("pull_request_review", criticReview("commented"), /commented review is not mapped/);
    await ignored("pull_request_review", tweak(fixture("pull_request_review.approved"), "action", "dismissed"), /dismissed is not mapped/);
  });

  it("records the AI critic's approval as a passed consistency check on the pull request and commit, never as an approval", async () => {
    const body = await recorded("pull_request_review", criticReview("approved"));
    expect(body.events).toEqual([
      {
        id: expect.any(String),
        type: "check_ran",
        card_id: "2",
        actor: "ai",
        at: NOW,
        check: "consistency",
        passed: true,
        summary: "The AI critic passed pull request #3.",
        url: "https://github.com/muxare/workbench/pull/3#pullrequestreview-900000020",
        pull_request: 3,
        commit_sha: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d",
      },
    ]);
    expect(types(await cardLog(db, "2"))).not.toContain("approved");
  });

  it("records the AI critic's changes request as a failed consistency check and a changes request", async () => {
    const body = await recorded("pull_request_review", criticReview("changes_requested"));
    expect(body.events).toMatchObject([
      { type: "check_ran", actor: "ai", check: "consistency", passed: false, pull_request: 3, commit_sha: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d" },
      { type: "changes_requested", actor: "ai", pull_request: 3 },
    ]);
  });
});

describe("who moves the card follows the owner's mode", () => {
  it("does not let the AI move a card to review when the owner works its function in assist or manual", async () => {
    for (const m of ["assist", "manual"] as const) {
      db = await openDb(":memory:");
      await addTeammate(db, { kind: "human", id: "mikael", name: "Mikael (invented test team)", roles: ["po", "be"] }, "2026-11-11T08:00:00Z");
      await addTeammate(db, { kind: "ai", id: "ai", name: "AI teammate" });
      await addCard(db, { id: "2", title: "Invented card 2", function_id: "implement_services", owner: "mikael", links: [] }, loadFunctionIds());
      app = createApp({ db, functionIds: loadFunctionIds(), now: () => new Date(NOW), githubWebhookSecret: SECRET, githubLogins: LOGINS });
      await setMode(m);
      await moveCard2("ready", "in_progress");
      const body = await recorded("pull_request", fixture("pull_request.opened"));
      expect(types(body.events)).toEqual(["review_requested"]);
      expect(body.reason).toMatch(new RegExp(`card 2 stays in_progress: mikael works implement_services in ${m}, where human writes, so only mikael may move the card, not ai`));
      expect((await cardStatus(db, "2")).state).toBe("in_progress");
    }
  });

  it("lets the AI move a card to review in delegate, and says nothing about staying", async () => {
    await setMode("delegate");
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", fixture("pull_request.opened"));
    expect(types(body.events)).toEqual(["review_requested", "status_changed"]);
    expect(body.reason).toBeUndefined();
  });

  it("lets the owner move their card to review in assist", async () => {
    await setMode("assist");
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", tweak(fixture("pull_request.opened"), "sender.login", "muxare"));
    expect(body.events).toMatchObject([{ type: "review_requested", actor: "mikael" }, { type: "status_changed", actor: "mikael", to: { state: "review" } }]);
  });

  it("does not let another person move the owner's card, even in delegate", async () => {
    await addTeammate(db, { kind: "human", id: "invented-other", name: "Invented other person", roles: ["be"] }, "2026-11-11T08:00:00Z");
    app = createApp({
      db,
      functionIds: loadFunctionIds(),
      now: () => new Date(NOW),
      githubWebhookSecret: SECRET,
      githubLogins: parseGithubLogins("muxare=mikael,workbench-agent[bot]=ai,invented-other-login=invented-other"),
    });
    await moveCard2("ready", "in_progress");
    const body = await recorded("pull_request", tweak(fixture("pull_request.opened"), "sender.login", "invented-other-login"));
    expect(types(body.events)).toEqual(["review_requested"]);
    expect(body.reason).toMatch(/only mikael or the AI may move the card, not invented-other/);
  });

  it("sends the card back on the AI critic's changes request only where the AI may move it", async () => {
    await setMode("assist");
    await moveCard2("ready", "in_progress", "review");
    const stays = await recorded("pull_request_review", criticReview("changes_requested"));
    expect(types(stays.events)).toEqual(["check_ran", "changes_requested"]);
    expect(stays.reason).toMatch(/card 2 stays review: mikael works implement_services in assist/);
    expect((await cardStatus(db, "2")).state).toBe("review");
    // The owner's own changes request moves it back in any mode.
    const moves = await recorded("pull_request_review", fixture("pull_request_review.changes_requested"));
    expect(types(moves.events)).toEqual(["changes_requested", "status_changed"]);
    expect((await cardStatus(db, "2")).state).toBe("in_progress");
  });

  it("follows the mode the card was picked in, not a profile change made after the pick", async () => {
    const pick = (mode: "assist" | "delegate") => ({ id: `invented-pick-${mode}`, type: "picked" as const, card_id: "2", actor: "mikael", at: "2026-11-11T09:00:00Z", mode });
    // Picked in delegate, then Mikael switches implement_services to assist: the AI may still move it.
    await moveCard2("ready", "in_progress");
    await appendEvents(db, [pick("delegate")]);
    await setMode("assist");
    expect(types((await recorded("pull_request", fixture("pull_request.opened"))).events)).toEqual(["review_requested", "status_changed"]);
    // Card 1, picked in assist while the profile still says delegate: the AI may not move it.
    await appendEvents(db, [
      { id: "invented-1-ready", type: "status_changed", card_id: "1", actor: "mikael", at: "2026-11-11T09:00:00Z", from: "backlog", to: { state: "ready" } },
      { id: "invented-1-pick", type: "picked", card_id: "1", actor: "mikael", at: "2026-11-11T09:00:00Z", mode: "assist" },
      { id: "invented-1-start", type: "status_changed", card_id: "1", actor: "mikael", at: "2026-11-11T09:00:00Z", from: "ready", to: { state: "in_progress" } },
      { id: "invented-mode-back", type: "mode_changed", teammate_id: "mikael", function_id: "implement_services", actor: "mikael", at: "2026-11-11T09:30:00Z", from: "assist", to: "delegate" },
    ]);
    const body = await recorded("pull_request", tweak(fixture("pull_request.opened"), "pull_request.body", "Workbench: #1"));
    expect(types(body.events)).toEqual(["review_requested"]);
    expect(body.reason).toMatch(/card 1 stays in_progress: the card was picked in assist, where human writes/);
  });

  it("sends the card back on the AI critic's changes request in delegate", async () => {
    await moveCard2("ready", "in_progress", "review");
    const body = await recorded("pull_request_review", criticReview("changes_requested"));
    expect(body.events).toMatchObject([{ type: "check_ran" }, { type: "changes_requested" }, { type: "status_changed", actor: "ai", to: { state: "in_progress" } }]);
  });
});

describe("pull_request merged", () => {
  it("moves the card to done after a person approved the pull request", async () => {
    await moveCard2("ready", "in_progress", "review");
    await recorded("pull_request_review", fixture("pull_request_review.approved"));
    const body = await recorded("pull_request", fixture("pull_request.closed.merged"));
    expect(body.events).toMatchObject([{ type: "status_changed", actor: "mikael", from: "review", to: { state: "done" } }]);
    expect((await cardStatus(db, "2")).state).toBe("done");
  });

  it("walks the whole loop from recorded payloads: changes requested, push, re-request, approve, merge", async () => {
    await moveCard2("ready", "in_progress");
    await recorded("push", fixture("push.created"));
    await recorded("pull_request", fixture("pull_request.opened"));
    await recorded("workflow_run", fixture("workflow_run.completed"));
    await recorded("pull_request_review", fixture("pull_request_review.changes_requested"));
    expect((await cardStatus(db, "2")).state).toBe("in_progress");
    await recorded("push", fixture("push"));
    await recorded("pull_request", fixture("pull_request.review_requested"));
    expect((await cardStatus(db, "2")).state).toBe("review");
    await recorded("pull_request_review", fixture("pull_request_review.approved"));
    await recorded("pull_request", fixture("pull_request.closed.merged"));
    expect(types((await cardLog(db, "2")).slice(2))).toEqual([
      "workspace_linked",
      "work_pushed",
      "review_requested",
      "status_changed",
      "check_ran",
      "changes_requested",
      "status_changed",
      "work_pushed",
      "review_requested",
      "status_changed",
      "approved",
      "status_changed",
    ]);
    expect((await cardStatus(db, "2")).state).toBe("done");
  });

  it("refuses a merge of a card that is not in review, even when approved", async () => {
    await moveCard2("ready", "in_progress");
    await recorded("pull_request_review", fixture("pull_request_review.approved"));
    await refused(/card 2 is in_progress; a card moves to done only from review/);
    expect((await cardStatus(db, "2")).state).toBe("in_progress");
  });

  async function refused(reason: RegExp) {
    const before = await cardLog(db, "2");
    const body = await outcome(await deliver("pull_request", fixture("pull_request.closed.merged")));
    expect(body.outcome).toBe("refused");
    expect(body.card_id).toBe("2");
    expect(body.reason).toMatch(reason);
    expect(await cardLog(db, "2")).toEqual(before);
  }

  it("refuses a merge nobody approved, and records nothing", async () => {
    await moveCard2("ready", "in_progress", "review");
    await refused(/stays review: nobody approved it/);
    expect((await cardStatus(db, "2")).state).toBe("review");
  });

  it("refuses a merge whose latest review requested changes", async () => {
    await recorded("pull_request_review", fixture("pull_request_review.approved"));
    await recorded("pull_request_review", fixture("pull_request_review.changes_requested"));
    await moveCard2("ready", "in_progress", "review");
    await refused(/latest review requested changes/);
  });

  it("refuses a merge approved only on another pull request", async () => {
    await moveCard2("ready", "in_progress", "review");
    await recorded("pull_request_review", tweak(fixture("pull_request_review.approved"), "pull_request.number", 9));
    await refused(/nobody approved it/);
  });

  it("refuses a merge the AI teammate approved, since its approval is only the critic passing", async () => {
    await moveCard2("ready", "in_progress", "review");
    await recorded("pull_request_review", criticReview("approved"));
    await refused(/nobody approved it/);
  });

  it("refuses a merge whose recorded approval is by the AI teammate, who is not a person", async () => {
    await moveCard2("ready", "in_progress", "review");
    await appendEvents(db, [
      { id: "invented-ai-approval", type: "approved", card_id: "2", actor: "ai", at: NOW, pull_request: 3, url: "https://github.com/muxare/workbench/pull/3" },
    ]);
    await refused(/approved by ai, who is not a person/);
  });

  it("does not need the AI critic when the card's function leaves it optional", async () => {
    // In assist the critic's changes request does not move the card back, so the card is still in review.
    await setMode("assist");
    await moveCard2("ready", "in_progress", "review");
    await recorded("pull_request_review", criticReview("changes_requested"));
    await recorded("pull_request_review", fixture("pull_request_review.approved"));
    expect((await recorded("pull_request", fixture("pull_request.closed.merged"))).events).toMatchObject([{ to: { state: "done" } }]);
  });

  describe("when the card's function requires the AI critic", () => {
    beforeEach(async () => {
      await requireCritic();
      await moveCard2("ready", "in_progress", "review");
    });

    it("counts the App's review, mapped to the AI by this repository's team file, as the critic's pass", async () => {
      const team = JSON.parse(readFileSync(new URL("../../../../teams/workbench/team.json", import.meta.url), "utf8")) as { github_logins: Record<string, string> };
      const githubLogins = parseGithubLogins(formatGithubLogins(team.github_logins));
      app = createApp({ db, functionIds: loadFunctionIds(), now: () => new Date(NOW), githubWebhookSecret: SECRET, githubLogins });
      const critic = await recorded("pull_request_review", fixture("pull_request_review.app_approved"));
      expect(critic.events).toMatchObject([
        {
          type: "check_ran",
          actor: "ai",
          check: "consistency",
          passed: true,
          pull_request: 3,
          commit_sha: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d",
          url: "https://github.com/muxare/workbench/pull/3#pullrequestreview-900000040",
        },
      ]);
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      expect((await recorded("pull_request", fixture("pull_request.closed.merged"))).events).toMatchObject([{ actor: "mikael", to: { state: "done" } }]);
    });

    it("refuses a merge the critic has not reviewed, even after a person's approval", async () => {
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await refused(/implement_services requires the AI critic to pass before a person approves, and it has not reviewed the pull request/);
    });

    it("refuses a merge whose latest critic review failed", async () => {
      await setMode("assist");
      await recorded("pull_request_review", criticReview("approved"));
      await recorded("pull_request_review", criticReview("changes_requested"));
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await refused(/its latest review failed/);
    });

    it("refuses a merge whose critic passed only after the person approved", async () => {
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await recorded("pull_request_review", criticReview("approved"));
      await refused(/it passed only after the approval/);
    });

    it("refuses a merge whose critic passed on another pull request", async () => {
      await recorded("pull_request_review", tweak(criticReview("approved"), "pull_request.number", 9));
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await refused(/it has not reviewed the pull request/);
    });

    it("moves the card to done when the critic passed and then a person approved", async () => {
      await recorded("pull_request_review", criticReview("approved"));
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      const body = await recorded("pull_request", fixture("pull_request.closed.merged"));
      expect(body.events).toMatchObject([{ type: "status_changed", actor: "mikael", from: "review", to: { state: "done" } }]);
    });

    it("still needs a person's approval after the critic passed", async () => {
      await recorded("pull_request_review", criticReview("approved"));
      await refused(/nobody approved it/);
    });

    it("does not count the AI's comment after a failed critic review as a pass", async () => {
      await setMode("assist");
      await recorded("pull_request_review", criticReview("changes_requested"));
      await ignored("pull_request_review", criticReview("commented"), /commented review is not mapped/);
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await refused(/its latest review failed/);
    });

    it("refuses a merge whose critic passed on an earlier commit than the merged head", async () => {
      await recorded("pull_request_review", tweak(criticReview("approved"), "review.commit_id", "5a1c0e7d3b9f24a6c8e1d0f3b7a2c4e6d8f0a1b2"));
      await recorded("pull_request_review", fixture("pull_request_review.approved"));
      await refused(/its pass is for 5a1c0e7d3b9f24a6c8e1d0f3b7a2c4e6d8f0a1b2, not the merged head 9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d/);
    });
  });

  it("refuses a merge whose approval is for an earlier commit than the merged head", async () => {
    await moveCard2("ready", "in_progress", "review");
    await recorded("pull_request_review", tweak(fixture("pull_request_review.approved"), "review.commit_id", "5a1c0e7d3b9f24a6c8e1d0f3b7a2c4e6d8f0a1b2"));
    await refused(/the approval is for 5a1c0e7d3b9f24a6c8e1d0f3b7a2c4e6d8f0a1b2, not the merged head 9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d/);
  });

  it("refuses a merge whose approval names no commit, as approvals recorded before commits were kept do", async () => {
    await moveCard2("ready", "in_progress", "review");
    await appendEvents(db, [
      { id: "invented-old-approval", type: "approved", card_id: "2", actor: "mikael", at: NOW, pull_request: 3, url: "https://github.com/muxare/workbench/pull/3" },
    ]);
    await refused(/the approval is for an unknown commit/);
  });

  it("ignores a pull request closed without merging, and a merge of a card already done", async () => {
    await ignored("pull_request", tweak(fixture("pull_request.closed.merged"), "pull_request.merged", false), /closed without merging/);
    await moveCard2("ready", "in_progress", "review", "done");
    await ignored("pull_request", fixture("pull_request.closed.merged"), /already done/);
  });
});

describe("GITHUB_LOGINS", () => {
  it("maps logins, case-insensitively, to teammate ids", () => {
    expect([...parseGithubLogins(" Muxare=mikael, workbench-agent[bot]=ai ")]).toEqual([
      ["muxare", "mikael"],
      ["workbench-agent[bot]", "ai"],
    ]);
    expect(parseGithubLogins(undefined).size).toBe(0);
    expect(() => parseGithubLogins("muxare")).toThrow(/not login=teammate/);
    expect(formatGithubLogins({ muxare: "mikael", "workbench-agent[bot]": "ai" })).toBe("muxare=mikael,workbench-agent[bot]=ai");
  });
});
