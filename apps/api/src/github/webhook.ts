// GitHub webhooks become card events (docs/dev-loop.md, "How the workbench and
// GitHub talk"). A delivery names a card by convention: the branch is
// `wb/<card id>-<short title>`, or the pull request body says
// `Workbench: #<card id>`, which wins when both name a card. The mapping:
//
// - `push` to a card's branch: `workspace_linked` the first time the card sees
//   that branch, and `work_pushed` when the push carries commits.
// - `pull_request` opened (not as a draft), ready_for_review or
//   review_requested (a reviewer asked, or asked again): `review_requested`,
//   and a card in progress moves to review.
// - `workflow_run` completed for the workflow `check` on a pull request:
//   `check_ran` with `check: "structural"`, passed on `success`, failed on
//   `failure`, `timed_out`, `startup_failure` and `action_required`. Every
//   other conclusion, and runs on `main`, are skipped.
// - `pull_request_review` submitted as approved: `approved`; as changes
//   requested: `changes_requested`, and a card in review moves back to in
//   progress.
// - `pull_request` closed with `merged: true`: a card in review moves to done,
//   but only when the latest verdict on that pull request is an `approved` by
//   a person.
//
// Everything else, and anything that names no card on the board or comes from
// a GitHub account that is not a teammate, is ignored: nothing is recorded,
// and the answer still says why. A delivery that would break a rule, or whose
// card moved while it was being handled, is refused the same way. Events are
// stored, not the payloads.
import type { CardEvent, CardStatus, WebhookResponse } from "@workbench/shared";
import { cardEvent, cardIdFromBody, cardIdFromBranch } from "@workbench/shared";
import type { z } from "zod";
import type { Db } from "../db/client.ts";
import { appendEvents, cardLog, eventsOfType, getCard, getTeammate, hasEvent, StoreError } from "../store.ts";
import { teammateForLogin } from "./logins.ts";
import {
  pullRequestPayload,
  pullRequestReviewPayload,
  pushPayload,
  withAction,
  workflowRunPayload,
  type PullRequestPayload,
  type PullRequestReviewPayload,
  type PushPayload,
  type WorkflowRunPayload,
} from "./payloads.ts";

/** The workflow whose runs are the structural check (.github/workflows/check.yml). */
export const CHECK_WORKFLOW = "check";
/** The branch work lands on; a check run there is about `main`, not about a card. */
export const MAIN_BRANCH = "main";

export interface WebhookContext {
  db: Db;
  /** GitHub login (lower case) to teammate id; see logins.ts. */
  logins: ReadonlyMap<string, string>;
  now: () => Date;
}

export interface Delivery {
  /** `X-GitHub-Event`. */
  event: string;
  /** `X-GitHub-Delivery`, unique per delivery and kept on a redelivery. */
  id: string;
  payload: unknown;
}

/** A payload that does not have the shape GitHub documents for its event. */
export class WebhookPayloadError extends Error {
  override name = "WebhookPayloadError";
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A card event before it has an id, a card and a time. */
type Draft = DistributiveOmit<CardEvent, "id" | "card_id" | "at">;

type Plan =
  | { kind: "ignore"; reason: string; cardId?: string }
  | { kind: "refuse"; reason: string; cardId: string }
  | { kind: "record"; cardId: string; events: Draft[] };

const ignore = (reason: string, cardId?: string): Plan => ({ kind: "ignore", reason, ...(cardId === undefined ? {} : { cardId }) });

/**
 * The id of the `index`th event recorded for a delivery. Derived from
 * `X-GitHub-Delivery`, so a redelivery of a recorded delivery is recognised
 * by its first event and records nothing twice.
 */
export function eventIdFor(deliveryId: string, index: number): string {
  return `github-${deliveryId}-${String(index)}`;
}

function cardIdForPullRequest(pr: { body: string | null; head: { ref: string } }): string | undefined {
  return cardIdFromBody(pr.body) ?? cardIdFromBranch(pr.head.ref);
}

function parse<S extends z.ZodType>(schema: S, event: string, payload: unknown): z.output<S> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new WebhookPayloadError(`the ${event} payload does not have GitHub's shape: ${issues}`);
  }
  return parsed.data;
}

/** Handle one delivery: record its card events, or say why it records nothing. */
export async function handleDelivery(ctx: WebhookContext, delivery: Delivery): Promise<WebhookResponse> {
  const answer = (outcome: WebhookResponse["outcome"], rest: Partial<WebhookResponse> = {}): WebhookResponse => ({
    outcome,
    delivery: delivery.id,
    events: [],
    ...rest,
  });
  if (await hasEvent(ctx.db, eventIdFor(delivery.id, 0))) {
    return answer("duplicate", { reason: `delivery ${delivery.id} is already recorded` });
  }
  const plan = await planDelivery(ctx, delivery);
  if (plan.kind !== "record") {
    return answer(plan.kind === "ignore" ? "ignored" : "refused", {
      reason: plan.reason,
      ...(plan.cardId === undefined ? {} : { card_id: plan.cardId }),
    });
  }
  const at = ctx.now().toISOString();
  const events = plan.events.map((draft, i) =>
    cardEvent.parse({ ...draft, id: eventIdFor(delivery.id, i), card_id: plan.cardId, at }),
  );
  try {
    await appendEvents(ctx.db, events);
  } catch (err) {
    // The plan read the card's status before the write; if another write moved the card in between, the
    // store refuses the stale `from`. That is the board's state changing, not GitHub's mistake, so say so with 200.
    if (err instanceof StoreError && err.code === "conflict") {
      return answer("refused", { card_id: plan.cardId, reason: `card ${plan.cardId} moved while the delivery was handled: ${err.message}` });
    }
    throw err;
  }
  return answer("recorded", { card_id: plan.cardId, events });
}

async function planDelivery(ctx: WebhookContext, delivery: Delivery): Promise<Plan> {
  const { event, payload } = delivery;
  const action = parse(withAction, event, payload).action;
  switch (event) {
    case "push":
      return planPush(ctx, parse(pushPayload, event, payload));
    case "pull_request":
      if (action === "opened" || action === "ready_for_review" || action === "review_requested" || action === "closed") {
        return planPullRequest(ctx, parse(pullRequestPayload, event, payload));
      }
      return ignore(`pull_request ${String(action)} is not mapped to a card event`);
    case "pull_request_review":
      if (action === "submitted") return planReview(ctx, parse(pullRequestReviewPayload, event, payload));
      return ignore(`pull_request_review ${String(action)} is not mapped to a card event`);
    case "workflow_run":
      if (action === "completed") return planWorkflowRun(ctx, parse(workflowRunPayload, event, payload));
      return ignore(`workflow_run ${String(action)} is not mapped; only a completed run is`);
    default:
      return ignore(`the ${event} event is not mapped to a card event`);
  }
}

/** The card if it is on the board, or the plan that ignores the delivery. */
async function cardOnBoard(ctx: WebhookContext, cardId: string | undefined, what: string) {
  if (cardId === undefined) return { plan: ignore(`${what} names no card`) };
  const card = await getCard(ctx.db, cardId);
  if (!card) return { plan: ignore(`card ${cardId} is not on the board`, cardId) };
  return { card };
}

/** The teammate a GitHub login maps to, or the plan that ignores the delivery. */
async function teammateFor(ctx: WebhookContext, login: string, cardId: string) {
  const id = teammateForLogin(ctx.logins, login);
  const teammate = id === undefined ? undefined : await getTeammate(ctx.db, id);
  if (!teammate) {
    return { plan: ignore(`the GitHub account ${login} is not mapped to a teammate (GITHUB_LOGINS)`, cardId) };
  }
  return { teammate };
}

async function planPush(ctx: WebhookContext, p: PushPayload): Promise<Plan> {
  if (!p.ref.startsWith("refs/heads/")) return ignore(`${p.ref} is not a branch`);
  const branch = p.ref.slice("refs/heads/".length);
  if (p.deleted) return ignore(`the branch ${branch} was deleted`);
  const found = await cardOnBoard(ctx, cardIdFromBranch(branch), `the branch ${branch}`);
  if (!found.card) return found.plan;
  const card = found.card;
  const who = await teammateFor(ctx, p.sender.login, card.id);
  if (!who.teammate) return who.plan;
  const actor = who.teammate.id;
  const linked = (await cardLog(ctx.db, card.id)).some((e) => e.type === "workspace_linked" && e.branch === branch);
  if (linked && p.commits.length === 0) return ignore(`the push to ${branch} carried no commits`, card.id);
  const events: Draft[] = [];
  if (!linked) {
    events.push({
      type: "workspace_linked",
      actor,
      workspace: "github",
      repository: p.repository.full_name,
      branch,
      url: `${p.repository.html_url}/tree/${branch}`,
    });
  }
  // The first push of a branch made locally carries commits too; a branch made on GitHub carries none.
  if (p.commits.length > 0) {
    events.push({ type: "work_pushed", actor, branch, head_sha: p.after, commits: p.commits.length, forced: p.forced, url: p.compare });
  }
  return { kind: "record", cardId: card.id, events };
}

async function planPullRequest(ctx: WebhookContext, p: PullRequestPayload): Promise<Plan> {
  const pr = p.pull_request;
  if (p.action === "closed" && pr.merged !== true) return ignore(`pull request #${String(pr.number)} was closed without merging`);
  if (p.action === "opened" && pr.draft === true) {
    return ignore(`pull request #${String(pr.number)} was opened as a draft; it asks for review when marked ready`);
  }
  const found = await cardOnBoard(ctx, cardIdForPullRequest(pr), `pull request #${String(pr.number)}`);
  if (!found.card) return found.plan;
  const card = found.card;
  if (p.action === "closed") return planMerge(ctx, p, card.id, card.status.state);
  const who = await teammateFor(ctx, p.sender.login, card.id);
  if (!who.teammate) return who.plan;
  const actor = who.teammate.id;
  const events: Draft[] = [{ type: "review_requested", actor, pull_request: pr.number, title: pr.title, url: pr.html_url }];
  if (card.status.state === "in_progress") events.push({ type: "status_changed", actor, from: "in_progress", to: { state: "review" } });
  return { kind: "record", cardId: card.id, events };
}

/**
 * A merge moves a card in review to done only after a person approved the
 * pull request: the latest `approved` or `changes_requested` on the card for
 * that pull request must be an `approved` whose actor is a person. Done is
 * reached only from review, as with a move by hand (`manualMoves`). GitHub's
 * own branch protection is the first guard; this is the board's, so a merge
 * that slipped past review never reaches done on the board.
 */
async function planMerge(ctx: WebhookContext, p: PullRequestPayload, cardId: string, state: CardStatus): Promise<Plan> {
  const pr = p.pull_request;
  if (state === "done") return ignore(`card ${cardId} is already done`, cardId);
  if (state !== "review") {
    return {
      kind: "refuse",
      cardId,
      reason: `pull request #${String(pr.number)} was merged, but card ${cardId} is ${state}; a card moves to done only from review`,
    };
  }
  const verdicts = (await cardLog(ctx.db, cardId)).filter(
    (e) => (e.type === "approved" || e.type === "changes_requested") && e.pull_request === pr.number,
  );
  const latest = verdicts.at(-1);
  const refuse = (why: string): Plan => ({
    kind: "refuse",
    cardId,
    reason: `pull request #${String(pr.number)} was merged, but card ${cardId} stays ${state}: ${why}`,
  });
  if (latest === undefined) return refuse("nobody approved it on the board");
  if (latest.type === "changes_requested") return refuse("the latest review requested changes");
  const approver = await getTeammate(ctx.db, latest.actor);
  if (approver?.kind !== "human") return refuse(`it was approved by ${latest.actor}, who is not a person`);
  const who = await teammateFor(ctx, pr.merged_by?.login ?? p.sender.login, cardId);
  if (!who.teammate) return who.plan;
  return { kind: "record", cardId, events: [{ type: "status_changed", actor: who.teammate.id, from: state, to: { state: "done" } }] };
}

async function planReview(ctx: WebhookContext, p: PullRequestReviewPayload): Promise<Plan> {
  const { review, pull_request: pr } = p;
  if (review.state !== "approved" && review.state !== "changes_requested") {
    return ignore(`a ${review.state} review is not mapped to a card event`);
  }
  const found = await cardOnBoard(ctx, cardIdForPullRequest(pr), `pull request #${String(pr.number)}`);
  if (!found.card) return found.plan;
  const card = found.card;
  const who = await teammateFor(ctx, review.user?.login ?? p.sender.login, card.id);
  if (!who.teammate) return who.plan;
  const actor = who.teammate.id;
  if (review.state === "approved") {
    return { kind: "record", cardId: card.id, events: [{ type: "approved", actor, pull_request: pr.number, url: review.html_url }] };
  }
  const text = review.body?.trim();
  const events: Draft[] = [
    { type: "changes_requested", actor, pull_request: pr.number, url: review.html_url, ...(text ? { text } : {}) },
  ];
  if (card.status.state === "review") events.push({ type: "status_changed", actor, from: "review", to: { state: "in_progress" } });
  return { kind: "record", cardId: card.id, events };
}

/**
 * The card a pull request's run is for. The run's payload has no pull request
 * body to read, so the card a `review_requested` event already links to that
 * pull request number comes first, as the body would; the branch name is the
 * fallback, for a run that arrives before the pull request asked for review.
 */
async function cardForRun(ctx: WebhookContext, pr: { number: number; head: { ref: string } }): Promise<string | undefined> {
  const fromPullRequest = (await eventsOfType(ctx.db, "review_requested")).filter((e) => e.pull_request === pr.number).at(-1)?.card_id;
  return fromPullRequest ?? cardIdFromBranch(pr.head.ref);
}

/** Whether a run's conclusion passed or failed the check; undefined for one that says nothing about the work. */
export function checkPassed(conclusion: string | null): boolean | undefined {
  if (conclusion === "success") return true;
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure" || conclusion === "action_required") return false;
  return undefined;
}

async function planWorkflowRun(ctx: WebhookContext, p: WorkflowRunPayload): Promise<Plan> {
  const run = p.workflow_run;
  if (run.name !== CHECK_WORKFLOW) return ignore(`the workflow ${String(run.name)} is not the structural check (${CHECK_WORKFLOW})`);
  const conclusion = run.conclusion;
  const passed = checkPassed(conclusion);
  if (passed === undefined) {
    return ignore(`run ${String(run.run_number)} of ${CHECK_WORKFLOW} ended ${String(conclusion)}, which says nothing about the work`);
  }
  if (run.head_branch === MAIN_BRANCH) return ignore(`run ${String(run.run_number)} of ${CHECK_WORKFLOW} is on ${MAIN_BRANCH}, not on a card's pull request`);
  const pr = run.pull_requests[0];
  if (pr === undefined) return ignore(`run ${String(run.run_number)} of ${CHECK_WORKFLOW} is not on a pull request`);
  const found = await cardOnBoard(ctx, await cardForRun(ctx, pr), `pull request #${String(pr.number)}`);
  if (!found.card) return found.plan;
  const card = found.card;
  // The check is run by CI on someone's push; the actor is the person or agent whose push started it.
  const who = await teammateFor(ctx, (run.triggering_actor ?? run.actor).login, card.id);
  if (!who.teammate) return who.plan;
  return {
    kind: "record",
    cardId: card.id,
    events: [
      {
        type: "check_ran",
        actor: who.teammate.id,
        check: "structural",
        passed,
        summary: `The ${CHECK_WORKFLOW} workflow, run ${String(run.run_number)}, ended ${String(conclusion)} on pull request #${String(pr.number)}.`,
        url: run.html_url,
      },
    ],
  };
}
