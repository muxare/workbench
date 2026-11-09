// Request and response shapes of the HTTP API in apps/api, shared with
// apps/web so neither side copies them. Field names are snake_case, like the
// domain schemas. There is no sign-in yet, so every write names its `actor`.
import { z } from "zod";
import { functionFrontMatter } from "./functionFile.ts";
import {
  card,
  cardEvent,
  cardLink,
  cardStatus,
  functionId,
  mode,
  question,
  teammate,
  teammateId,
  type CardStatus,
} from "./domain.ts";

/**
 * The status moves a person can make directly with `POST /cards/:id/status`.
 * Into and out of `in_progress` from `ready` is a pick, and into and out of
 * `needs_input` is an ask and an answer; those have their own endpoints
 * because they record more than a status change.
 */
export const manualMoves: Readonly<Record<CardStatus, readonly CardStatus[]>> = {
  backlog: ["ready"],
  ready: ["backlog"],
  in_progress: ["review", "ready"],
  needs_input: [],
  review: ["in_progress", "done"],
  done: [],
};

export function isManualMove(from: CardStatus, to: CardStatus): boolean {
  return manualMoves[from].includes(to);
}

/** `POST /cards`: a new card starts in `backlog`. Its function must exist in process/. */
export const createCardRequest = z.strictObject({
  actor: teammateId,
  title: z.string().min(1),
  function_id: functionId,
  owner: teammateId,
  milestone: z.string().min(1).optional(),
  links: z.array(cardLink).default([]),
});
export type CreateCardRequest = z.input<typeof createCardRequest>;

/**
 * `POST /cards/:id/pick`: move a `ready` card to `in_progress`. The mode is
 * the one the card's owner set for its function; `mode`, when given, must
 * match it.
 */
export const pickRequest = z.strictObject({ actor: teammateId, mode: mode.optional() });
export type PickRequest = z.infer<typeof pickRequest>;

/** `POST /cards/:id/questions`: ask on an `in_progress` card, which then waits on `asked_of`. */
export const askRequest = z.strictObject({
  actor: teammateId,
  asked_of: teammateId,
  text: z.string().min(1),
  why_it_blocks: z.string().min(1),
});
export type AskRequest = z.infer<typeof askRequest>;

/**
 * `POST /cards/:id/questions/:questionId/answer`: answer an open question.
 * The actor decides, so it must be a human. A card waiting on this question
 * goes back to `in_progress`.
 */
export const answerRequest = z.strictObject({ actor: teammateId, answer: z.string().min(1) });
export type AnswerRequest = z.infer<typeof answerRequest>;

/**
 * `POST /cards/:id/status`: one of the `manualMoves`. `from` must be the
 * card's current state, so two people moving the same card cannot both win.
 */
export const moveStatusRequest = z.strictObject({
  actor: teammateId,
  from: cardStatus,
  to: z.strictObject({ state: cardStatus.exclude(["needs_input"]) }),
});
export type MoveStatusRequest = z.infer<typeof moveStatusRequest>;

/** A question rebuilt from its `asked` and `answered` events. */
export const questionView = question;

/** `GET /board`. `last_seq` is where to start the event stream (`GET /events?after=`). */
export const boardResponse = z.object({
  cards: z.array(card),
  teammates: z.array(teammate),
  open_questions: z.array(questionView),
  log: z.array(cardEvent),
  last_seq: z.number().int().nonnegative(),
});
export type BoardResponse = z.infer<typeof boardResponse>;

/**
 * `GET /cards/:id`. `function` is the front matter of the card's function as
 * process/functions holds it now, so card detail can show its protocol,
 * inputs, outputs and checks without hardcoding them. It is null when
 * process/ no longer defines that function.
 */
export const cardResponse = z.object({
  card,
  log: z.array(cardEvent),
  questions: z.array(questionView),
  function: functionFrontMatter.nullable(),
});
export type CardResponse = z.infer<typeof cardResponse>;

/** Every write: the card as it now stands and the events the write appended, in order. */
export const writeResponse = z.object({ card, events: z.array(cardEvent) });
export type WriteResponse = z.infer<typeof writeResponse>;

/**
 * `POST /teammates/:id/run`: run one step of an AI teammate. It takes no body;
 * the teammate chooses the first card it may pick, works it with its
 * provider, and appends the pick, the move to In progress, its report, its
 * question and the move to Needs input as one write. The answer is the card
 * as it now stands and those five events. Refusals: 404 for an unknown
 * teammate, 422 for a teammate that is not an AI, 409 when no card is
 * eligible or the card changed while the teammate worked.
 */
export const teammateRunResponse = writeResponse;
export type TeammateRunResponse = WriteResponse;

export const apiErrorCode = z.enum(["invalid_request", "not_found", "conflict", "forbidden", "rule_violation"]);
export type ApiErrorCode = z.infer<typeof apiErrorCode>;

/** Every 4xx body. `reason` is a sentence for people; `issues` lists zod's findings for a bad body. */
export const apiError = z.object({
  error: apiErrorCode,
  reason: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiError>;
