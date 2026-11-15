// The tools the MCP server offers an agent session, such as Claude Code
// working from the workbench board (docs/dev-loop.md, stage 3). Each tool is a
// plain function over the API client, so tests call them against the real
// API without an MCP connection; `server.ts` registers them on an McpServer.
//
// The session acts as the board's AI teammate. Every rule is the API's: a
// pick the AI may not make, a question on a card that is not in progress or a
// report on a card nobody works on comes back as a tool error carrying the
// API's reason. The tools only add what an agent needs around those calls:
// the function definition and the owner's mode next to the card, waiting for
// an answer, and the branch convention the webhooks read.
//
// A batch (docs/dev-loop.md, stage 3b) is several Ready cards a person hands
// to the AI at once. `list_batches` finds one, `get_batch` reads its cards
// the way `get_card` shows a card, and `plan_batch` posts the waves the
// session will work them in; the API checks the plan.
//
// `get_batch` says per card whether the AI may pick it, by the API's own
// eligibility rule (apps/api/src/teammates/eligibility.ts), a pure function
// over the card, its log, the definitions and the board; nothing here opens
// the database.
import { checkEligibility, SESSION_MODES } from "@workbench/api/src/teammates/eligibility.ts";
import {
  askRequest,
  batchListState,
  branchForCard,
  cardIdFromBranch,
  cardStatus,
  ownerMode,
  planBatchRequest,
  pullRequestBodyLine,
  reportRequest,
  type Batch,
  type BoardResponse,
  type Card,
  type CardResponse,
  type FunctionFrontMatter,
  type Mode,
  type Protocol,
  type Question,
} from "@workbench/shared";
import { z } from "zod";
import { ApiRefusal, ApiUnreachable, type WorkbenchClient } from "./client.ts";
import { waitForAnswer, type WaitResult } from "./wait.ts";

/** How long `ask_question` and `wait_for_answer` wait when not told. */
export const DEFAULT_WAIT_SECONDS = 300;
/**
 * The longest wait a call may ask for: 25 minutes, under the 30 minutes
 * Claude Code allows a stdio tool call to stay silent before it gives up.
 */
export const MAX_WAIT_SECONDS = 1500;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ToolDeps {
  client: WorkbenchClient;
  /** The teammate the session acts as; without it, the board's only AI teammate. */
  actor?: string;
}

const batchIdInput = z.string().min(1).describe("The batch's id on the board, such as \"2\".");
const cardIdInput = z.string().min(1).describe("The card's id on the board, such as \"4\".");
const waitInput = z
  .number()
  .int()
  .min(0)
  .max(MAX_WAIT_SECONDS)
  .optional()
  .describe(`How many seconds to wait for the answer, ${String(DEFAULT_WAIT_SECONDS)} when left out; 0 returns at once.`);

export const inputs = {
  list_cards: z.object({
    state: cardStatus.optional().describe("Only cards in this state, such as ready."),
  }),
  get_card: z.object({ card_id: cardIdInput }),
  pick_card: z.object({ card_id: cardIdInput }),
  ask_question: z.object({
    card_id: cardIdInput,
    text: askRequest.shape.text.describe("The question, written so the person can answer it without opening the code."),
    why_it_blocks: askRequest.shape.why_it_blocks.describe("Why the work cannot go on without the answer."),
    asked_of: z
      .string()
      .min(1)
      .optional()
      .describe("The teammate to ask; the card's owner when left out. With external, the person who relays the question outside the team."),
    external: askRequest.shape.external.describe(
      "For an answer only someone outside the team has: an artifact made outside the team (made_by external in process/artifacts.md) and a free-text source in it, such as domain_rules and \"caretaker's fault records\". The card then waits on that source, relayed by asked_of.",
    ),
    wait_seconds: waitInput,
  }),
  wait_for_answer: z.object({
    card_id: cardIdInput,
    question_id: z.string().min(1).describe("The question id that ask_question returned."),
    wait_seconds: waitInput,
  }),
  post_report: z.object({
    card_id: cardIdInput,
    text: reportRequest.shape.text.describe("What was done, what is left and what a reviewer should look at first."),
  }),
  list_batches: z.object({
    state: batchListState.optional().describe("Only open batches in this state: handed (no plan yet) or planned."),
  }),
  get_batch: z.object({ batch_id: batchIdInput }),
  plan_batch: z.object({
    batch_id: batchIdInput,
    waves: planBatchRequest.shape.waves.describe(
      "The waves in the order they are worked. Each wave lists the card_ids worked side by side and a note saying why those cards are together and apart from the others.",
    ),
  }),
  link_branch: z.object({
    card_id: cardIdInput,
    branch: z.string().min(1).optional().describe("A branch already made for the card; checked against the naming rule. Left out, one is suggested."),
  }),
};

type Inputs = { [K in keyof typeof inputs]: z.output<(typeof inputs)[K]> };

export type Tools = { [K in keyof Inputs]: (input: Inputs[K], signal?: AbortSignal) => Promise<ToolResult> };

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Turn the API's refusals into tool errors the session can read and act on. */
async function guarded(work: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ApiRefusal) {
      return fail(`The workbench refused this (HTTP ${String(err.status)} ${err.code}): ${err.message}`);
    }
    if (err instanceof ApiUnreachable) return fail(err.message);
    throw err;
  }
}

/** The mode the card is worked in: its owner's choice for the function, or the function's default. */
function cardMode(card: Card, board: BoardResponse, definition: CardResponse["function"]): Mode | null {
  const owner = board.teammates.find((t) => t.id === card.owner);
  if (owner?.kind !== "human" || !definition) return null;
  return ownerMode(owner, definition);
}

/** What the protocol of a mode asks of the AI, in a sentence the session can follow. */
function protocolNote(mode: Mode, protocol: Protocol | undefined): string {
  if (!protocol) return `The function has no protocol for ${mode}.`;
  const who = { ai: "you (the AI)", human: "the person", both: "you and the person", none: "nobody" } as const;
  const opening = `In ${mode}, the work is written by ${who[protocol.writes]}, questions are asked by ${who[protocol.asks]}, and a person decides.`;
  return protocol.note ? `${opening} ${protocol.note}` : opening;
}

/** The owner's mode for a card, its protocol and what that protocol lets the AI do, as `get_card` and `get_batch` show them. */
function modeView(detail: CardResponse, board: BoardResponse) {
  const mode = cardMode(detail.card, board, detail.function);
  return {
    mode,
    protocol: mode && detail.function ? (detail.function.protocols[mode] ?? null) : null,
    what_the_ai_does: mode && detail.function ? protocolNote(mode, detail.function.protocols[mode]) : null,
  };
}

/**
 * A batch card as planning needs it: what `get_card` says about the card and
 * its mode, its dependencies split into those inside the batch (which order
 * the waves) and those outside (already done when the batch was handed), the
 * function's outputs, which hint at what the work touches, and the questions
 * still open, and whether the AI may pick it once the batch cards it depends
 * on are done. The full definition and the log are left to `get_card`.
 */
function batchCardView(detail: CardResponse, board: BoardResponse, batch: Batch, definitions: ReadonlyMap<string, FunctionFrontMatter>) {
  const dependsOn = detail.card.links.filter((l) => l.relation === "depends_on").map((l) => l.card_id);
  const { mode, what_the_ai_does } = modeView(detail, board);
  // The rule of a pick from an agent session, with the batch's other cards
  // counted as done, as when the batch was handed: the plan orders those.
  // A mode changed since the hand-over shows here as may_pick false.
  const assumed = board.cards.map((c) => (c.id !== detail.card.id && batch.card_ids.includes(c.id) ? { ...c, status: { state: "done" as const } } : c));
  const verdict = checkEligibility(detail.card, detail.log, definitions, board.teammates, assumed, SESSION_MODES);
  return {
    id: detail.card.id,
    title: detail.card.title,
    state: detail.card.status.state,
    owner: detail.card.owner,
    ...(detail.card.milestone === undefined ? {} : { milestone: detail.card.milestone }),
    function: detail.function
      ? { name: detail.function.name, title: detail.function.title, summary: detail.function.summary, outputs: detail.function.outputs }
      : { name: detail.card.function_id, title: null, summary: null, outputs: [] },
    mode,
    what_the_ai_does,
    may_pick: verdict.eligible,
    ...(verdict.eligible ? {} : { why_not: verdict.reason }),
    depends_on_in_batch: dependsOn.filter((id) => batch.card_ids.includes(id)),
    depends_on_outside: dependsOn.filter((id) => !batch.card_ids.includes(id)),
    branch: branchForCard(detail.card) ?? null,
    open_questions: detail.questions.filter((q) => q.answer === undefined).map(questionView),
  };
}

/** What the session does next with a batch, by its state. */
function batchNext(batch: Batch, actingAs: string): string {
  if (batch.handed_to !== actingAs) return `Batch ${batch.id} was handed to ${batch.handed_to}, not ${actingAs}; leave it to that teammate.`;
  if (batch.state === "handed") return `Sort the cards into waves and post them with plan_batch (batch_id "${batch.id}").`;
  if (batch.state === "planned") return "Work the plan wave by wave: pick each card of a wave with pick_card, one subagent per card, and start the next wave once the cards it depends on are done.";
  return `Every card of batch ${batch.id} is in review or done.`;
}

function questionView(q: Question) {
  return { id: q.id, asked_of: q.asked_of, external: q.external ?? null, text: q.text, why_it_blocks: q.why_it_blocks, answer: q.answer ?? null, decided_by: q.decided_by ?? null };
}

/** Who or what a question waits on, in words: the person, or the external source and the person relaying it. */
function waitingOnText(q: Question): string {
  return q.external ? `${q.external.artifact} (${q.external.source}), relayed by ${q.asked_of}` : q.asked_of;
}

function waitView(result: WaitResult, cardId: string, waitedSeconds: number) {
  const q = questionView(result.question);
  if (result.answered) return { answered: true, question: q, next: "Go on with the work using the answer." };
  const why = result.reason === "timeout" ? `No answer within ${String(waitedSeconds)} seconds.` : "The API closed the event stream before an answer came.";
  return {
    answered: false,
    question: q,
    next: `${why} The card waits on ${waitingOnText(result.question)}. Call wait_for_answer with card_id "${cardId}" and question_id "${result.question.id}" to keep waiting.`,
  };
}

export function createTools(deps: ToolDeps): Tools {
  const { client } = deps;
  let actor = deps.actor;

  /** The teammate this session acts as: the configured one, or the board's only AI teammate. */
  async function self(board?: BoardResponse): Promise<string> {
    if (actor !== undefined) return actor;
    const ais = (board ?? (await client.board())).teammates.filter((t) => t.kind === "ai");
    if (ais.length !== 1) {
      throw new ApiRefusal(
        422,
        "rule_violation",
        `the board has ${String(ais.length)} AI teammates, so set WORKBENCH_ACTOR to the one this session acts as`,
      );
    }
    actor = ais[0]!.id;
    return actor;
  }

  const wait = (cardId: string, questionId: string, seconds: number | undefined, signal?: AbortSignal) => {
    const s = seconds ?? DEFAULT_WAIT_SECONDS;
    return waitForAnswer(client, cardId, questionId, { timeoutMs: s * 1000, ...(signal ? { signal } : {}) }).then((r) => waitView(r, cardId, s));
  };

  return {
    list_cards: (input) =>
      guarded(async () => {
        const board = await client.board();
        const cards = board.cards.filter((c) => input.state === undefined || c.status.state === input.state);
        return ok({
          acting_as: await self(board),
          cards: cards.map((c) => ({
            id: c.id,
            title: c.title,
            state: c.status.state,
            ...(c.status.state === "needs_input" ? { waiting_on: c.status.waiting_on } : {}),
            function: c.function_id,
            owner: c.owner,
            ...(c.milestone === undefined ? {} : { milestone: c.milestone }),
            depends_on: c.links.filter((l) => l.relation === "depends_on").map((l) => l.card_id),
          })),
        });
      }),

    get_card: (input) =>
      guarded(async () => {
        const [detail, board] = await Promise.all([client.card(input.card_id), client.board()]);
        return ok({
          card: detail.card,
          ...modeView(detail, board),
          branch: branchForCard(detail.card) ?? null,
          pull_request_body_line: pullRequestBodyLine(detail.card.id),
          questions: detail.questions.map(questionView),
          function: detail.function,
          log: detail.log,
        });
      }),

    pick_card: (input) =>
      guarded(async () => {
        // Read the function before picking: after a pick, nothing may fail, or a retry meets a 409.
        const definition = (await client.card(input.card_id)).function;
        const out = await client.pick(input.card_id, { actor: await self() });
        const picked = out.events.find((e) => e.type === "picked");
        const mode = picked?.type === "picked" ? picked.mode : null;
        const branch = branchForCard(out.card);
        return ok({
          card: out.card,
          mode,
          what_the_ai_does: mode && definition ? protocolNote(mode, definition.protocols[mode]) : null,
          branch: branch ?? null,
          next: branch
            ? `Work on the branch ${branch} (link_branch says how). Ask on the card with ask_question when stuck, and post_report when done.`
            : "Ask on the card with ask_question when stuck, and post_report when done.",
        });
      }),

    ask_question: (input, signal) =>
      guarded(async () => {
        const by = await self();
        const asked_of = input.asked_of ?? (await client.card(input.card_id)).card.owner;
        const out = await client.ask(input.card_id, {
          actor: by,
          asked_of,
          ...(input.external ? { external: input.external } : {}),
          text: input.text,
          why_it_blocks: input.why_it_blocks,
        });
        const asked = out.events.find((e) => e.type === "asked");
        if (asked?.type !== "asked") throw new Error("the API recorded no asked event");
        // The question is on the card now. If waiting fails, say so with its id, so the session
        // waits again instead of asking the same question twice.
        try {
          return ok(await wait(input.card_id, asked.question_id, input.wait_seconds, signal));
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err);
          return ok({
            answered: false,
            question: { id: asked.question_id, asked_of: asked.asked_of, external: asked.external ?? null, text: asked.text, why_it_blocks: asked.why_it_blocks, answer: null, decided_by: null },
            next: `The question was asked, but waiting for the answer failed (${why}). Do not ask again: call wait_for_answer with card_id "${input.card_id}" and question_id "${asked.question_id}".`,
          });
        }
      }),

    wait_for_answer: (input, signal) => guarded(async () => ok(await wait(input.card_id, input.question_id, input.wait_seconds, signal))),

    post_report: (input) =>
      guarded(async () => {
        const out = await client.report(input.card_id, { actor: await self(), text: input.text });
        return ok({ card: out.card, events: out.events });
      }),

    list_batches: (input) =>
      guarded(async () => {
        // The board carries the open batches, oldest first, as GET /api/batches does.
        const board = await client.board();
        const actingAs = await self(board);
        const mine = board.batches.filter((b) => b.handed_to === actingAs);
        const oldestHanded = mine.find((b) => b.state === "handed");
        const shown = board.batches.filter((b) => input.state === undefined || b.state === input.state);
        return ok({
          acting_as: actingAs,
          batches: shown.map((b) => ({
            id: b.id,
            state: b.state,
            card_ids: b.card_ids,
            handed_to: b.handed_to,
            handed_by: b.handed_by,
            handed_at: b.handed_at,
            waves: b.plan?.waves.length ?? null,
          })),
          next: oldestHanded
            ? `Unless a batch was named, take batch ${oldestHanded.id}, the oldest one handed to you without a plan: read it with get_batch and plan it with plan_batch.`
            : mine.length > 0
              ? "Every open batch handed to you has a plan; read one with get_batch to work it."
              : "No open batch is handed to you.",
        });
      }),

    get_batch: (input) =>
      guarded(async () => {
        const [detail, board] = await Promise.all([client.batch(input.batch_id), client.board()]);
        const actingAs = await self(board);
        const definitions = new Map(detail.cards.flatMap((c) => (c.function ? [[c.function.name, c.function] as const] : [])));
        return ok({
          batch: detail.batch,
          cards: detail.cards.map((c) => batchCardView(c, board, detail.batch, definitions)),
          next: batchNext(detail.batch, actingAs),
        });
      }),

    plan_batch: (input) =>
      guarded(async () => {
        try {
          const out = await client.planBatch(input.batch_id, { actor: await self(), waves: input.waves });
          return ok({ batch: out.batch, next: batchNext(out.batch, out.batch.handed_to) });
        } catch (err) {
          if (err instanceof ApiRefusal && err.status === 409) {
            // Card #16 adds the code already_planned for a batch that has a plan.
            // The message test is a fallback for the API before that; remove it once #16's fix is merged.
            const retry = err.code === "already_planned" || /already has a plan/.test(err.message)
              ? "The batch keeps the plan it has; read it with get_batch and work it."
              : "Nothing was recorded. Fix the plan and call plan_batch again.";
            return fail(`The workbench refused this plan (HTTP 409 ${err.code}): ${err.message}. ${retry}`);
          }
          throw err;
        }
      }),

    link_branch: (input) =>
      guarded(async () => {
        const { card, log } = await client.card(input.card_id);
        let branch = input.branch;
        if (branch === undefined) {
          branch = branchForCard(card);
          if (branch === undefined) {
            return fail(`Card ${card.id} has no number for an id, so no branch can name it; link its pull request with the body line "${pullRequestBodyLine(card.id)}".`);
          }
        } else if (cardIdFromBranch(branch) !== card.id) {
          const named = cardIdFromBranch(branch);
          return fail(
            `The branch ${branch} ${named === undefined ? "names no card" : `names card ${named}`}; a branch for card ${card.id} is named wb/${card.id}-<short title>, such as ${branchForCard(card) ?? `wb/${card.id}-work`}.`,
          );
        }
        const linked = log.flatMap((e) => (e.type === "workspace_linked" ? [{ branch: e.branch, repository: e.repository, url: e.url }] : []));
        return ok({
          branch,
          linked_on_board: linked.some((l) => l.branch === branch),
          linked_branches: linked,
          pull_request_body_line: pullRequestBodyLine(card.id),
          how: [
            `Create the branch with git switch -c ${branch} and commit the work on it.`,
            "Push it to GitHub as the workbench App (a token from pnpm --filter @workbench/api github:token <owner/repo>). The first push reaches the board through the webhook, which records workspace_linked, and each push with commits records work_pushed.",
            `Open the pull request with the line "${pullRequestBodyLine(card.id)}" in its body; opening it records review_requested and moves the card to review.`,
          ],
        });
      }),
  };
}
