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
import {
  askRequest,
  branchForCard,
  cardIdFromBranch,
  cardStatus,
  ownerMode,
  pullRequestBodyLine,
  reportRequest,
  type BoardResponse,
  type Card,
  type CardResponse,
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
    asked_of: z.string().min(1).optional().describe("The teammate to ask; the card's owner when left out."),
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

function questionView(q: Question) {
  return { id: q.id, asked_of: q.asked_of, text: q.text, why_it_blocks: q.why_it_blocks, answer: q.answer ?? null, decided_by: q.decided_by ?? null };
}

function waitView(result: WaitResult, cardId: string, waitedSeconds: number) {
  const q = questionView(result.question);
  if (result.answered) return { answered: true, question: q, next: "Go on with the work using the answer." };
  const why = result.reason === "timeout" ? `No answer within ${String(waitedSeconds)} seconds.` : "The API closed the event stream before an answer came.";
  return {
    answered: false,
    question: q,
    next: `${why} The card waits on ${result.question.asked_of}. Call wait_for_answer with card_id "${cardId}" and question_id "${result.question.id}" to keep waiting.`,
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
        const mode = cardMode(detail.card, board, detail.function);
        return ok({
          card: detail.card,
          mode,
          protocol: mode && detail.function ? (detail.function.protocols[mode] ?? null) : null,
          what_the_ai_does: mode && detail.function ? protocolNote(mode, detail.function.protocols[mode]) : null,
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
        const out = await client.ask(input.card_id, { actor: by, asked_of, text: input.text, why_it_blocks: input.why_it_blocks });
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
            question: { id: asked.question_id, asked_of: asked.asked_of, text: asked.text, why_it_blocks: asked.why_it_blocks, answer: null, decided_by: null },
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
