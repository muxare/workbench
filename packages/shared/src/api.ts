// Request and response shapes of the HTTP API in apps/api, shared with
// apps/web so neither side copies them. Field names are snake_case, like the
// domain schemas. There is no sign-in yet, so every write names its `actor`.
import { z } from "zod";
import { chainFunction } from "./chain.ts";
import { functionFrontMatter, functionRole } from "./functionFile.ts";
import {
  aiTeammate,
  card,
  cardEvent,
  cardLink,
  cardStatus,
  criticGates,
  cycle,
  functionId,
  hiddenEventTypes,
  humanTeammate,
  logFilters,
  mode,
  question,
  streamEvent,
  teammate,
  teammateId,
  teammateRoles,
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

/**
 * The board's current cycle (`currentCycle`, read at the server's clock) and
 * its whole cycle log: every event whose `at` falls in the window, oldest
 * first, unfiltered. `ended` is true between cycles, when the board shows the
 * cycle that ended last; events after its end are in no cycle log.
 */
export const boardCycle = z.object({ cycle, ended: z.boolean(), log: z.array(streamEvent) });
export type BoardCycle = z.infer<typeof boardCycle>;

/**
 * `GET /board`. `last_seq` is where to start the event stream (`GET /events?after=`).
 * The log is the board log: card, teammate and team events alike, unfiltered.
 * Each teammate's `process_profile` is derived from their `mode_changed`
 * events. `log_filters` is the team's filter for each log, derived from the
 * `log_filter_changed` events; the screens apply it where they show a log,
 * because the log here is also what the board follows the stream with.
 * `cycle` is the current cycle with its log, or null when no cycle has started.
 * `functions` is every function in process/functions, in file order, with
 * just what `chainOf` and `ownerMode` need, so a panel counts a person's modes
 * over the same chain and with the same default as their profile, and keeps
 * doing so as `mode_changed` and `roles_changed` events stream in.
 */
export const boardResponse = z.object({
  cards: z.array(card),
  teammates: z.array(teammate),
  functions: z.array(chainFunction),
  open_questions: z.array(questionView),
  log: z.array(streamEvent),
  log_filters: logFilters,
  cycle: boardCycle.nullable(),
  last_seq: z.number().int().nonnegative(),
});
export type BoardResponse = z.infer<typeof boardResponse>;

/**
 * `POST /logs/:log/filter`: a person sets the event types one log hides for
 * the whole team. `hidden` is the whole set, in any order; an empty list shows
 * everything. `was_hidden` is the set the person's view showed as hidden when
 * they made the change; if the log hides something else by now, someone
 * changed it in between and the request is refused with 409, so two browsers
 * cannot silently overwrite each other. The actor must be a person. A change
 * appends one `log_filter_changed` event, which reaches every board over
 * `GET /events`; asking for the filter the log already has appends nothing.
 * The answer is every log's filter as it now stands.
 */
export const setLogFilterRequest = z.strictObject({ actor: teammateId, hidden: hiddenEventTypes, was_hidden: hiddenEventTypes });
export type SetLogFilterRequest = z.infer<typeof setLogFilterRequest>;

export const logFiltersResponse = z.object({ log_filters: logFilters });
export type LogFiltersResponse = z.infer<typeof logFiltersResponse>;

/**
 * `POST /functions/:id/critic-gate`: a person sets whether the AI critic must
 * pass on a pull request before a person's approval of it lets a merge move a
 * card of that function to done. A person's approval is needed either way.
 * `was_required` is the setting the person's view showed; if the setting is
 * something else by now, the request is refused with 409. The actor must be a
 * person. A change appends one `critic_gate_changed` event; asking for the
 * setting the function already has appends nothing. The answer, also from
 * `GET /functions/critic-gates`, is every function's gate that someone has
 * set; a function not listed has the gate off.
 */
export const setCriticGateRequest = z.strictObject({ actor: teammateId, required: z.boolean(), was_required: z.boolean() });
export type SetCriticGateRequest = z.infer<typeof setCriticGateRequest>;

export const criticGatesResponse = z.object({ critic_gates: criticGates });
export type CriticGatesResponse = z.infer<typeof criticGatesResponse>;

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

/**
 * One step in a person's chain on `GET /teammates/:id/profile`. Everything but
 * `mode`, `mode_is_default` and `ai_may_pick` is read from the function's file
 * in process/functions; the app never lists a function's fields itself.
 */
export const profileStep = z.object({
  function_id: functionId,
  role: functionRole,
  title: z.string().min(1),
  summary: z.string().min(1),
  /** The function file's `modes`: the modes a person may choose, and the one used until they do. */
  modes: z.object({ default: mode, allowed: z.array(mode).min(1) }),
  /** The mode this person works the step in: their choice, or the function's default. */
  mode,
  /** True when the person has not chosen a mode, so `mode` is the function's default. */
  mode_is_default: z.boolean(),
  /**
   * Whether an AI teammate may pick a Ready card on this step on its own, given
   * `mode`: the mode is one it works in and the mode's protocol lets the AI ask.
   */
  ai_may_pick: z.boolean(),
});
export type ProfileStep = z.infer<typeof profileStep>;

/**
 * `GET /teammates/:id/profile`: a person and their chain of steps. The chain is
 * every function whose `role` is one of the person's roles, then every other function
 * in their process profile. `unknown_functions` lists profile entries with no
 * file in process/functions, which the API cannot describe.
 */
export const teammateProfileResponse = z.object({
  teammate: humanTeammate,
  steps: z.array(profileStep),
  unknown_functions: z.array(functionId),
});
export type TeammateProfileResponse = z.infer<typeof teammateProfileResponse>;

/**
 * How one person's mode for a step decides whether the AI teammate may work
 * it. `mode` is the person's mode for the function (their choice, or the
 * function's default); `reason` says why the AI may not pick, and is null when
 * it may.
 */
export const aiStepOwner = z.object({
  teammate_id: teammateId,
  mode,
  ai_may_pick: z.boolean(),
  reason: z.string().min(1).nullable(),
});
export type AiStepOwner = z.infer<typeof aiStepOwner>;

/**
 * One function on an AI teammate's profile: what process/functions says about
 * it, and, for each person who owns cards on it, whether the AI may pick those
 * cards. The people are those whose own profile lists the step (the same
 * rule as `GET /teammates/:id/profile`), then anyone else who owns a card on it.
 */
export const aiProfileStep = z.object({
  function_id: functionId,
  role: functionRole,
  title: z.string().min(1),
  summary: z.string().min(1),
  owners: z.array(aiStepOwner),
});
export type AiProfileStep = z.infer<typeof aiProfileStep>;

/** A card on an AI teammate's profile, with the mode it is or would be worked in. */
export const aiProfileCard = z.object({ card, mode });
export type AiProfileCard = z.infer<typeof aiProfileCard>;

/**
 * `GET /teammates/:id/profile` for an AI teammate. The same route answers a
 * person with `teammateProfileResponse`; `teammate.kind` tells them apart.
 * An AI teammate has no modes of its own: it works in the mode each owner
 * set, so its steps are derived from the people's modes, the function files
 * and the eligibility rules the runner uses.
 *
 * - `works_in`: the modes this teammate can work in at all.
 * - `provider`: what does its work ("stub" until a model is plugged in).
 * - `timer`: the interval it runs on by itself, or null when it runs only on
 *   `POST /teammates/:id/run`.
 * - `now`: cards it picked that are in progress, waiting for input or in review.
 * - `next`: Ready cards it may pick, in the order a run takes them.
 * - `not_next`: Ready cards it may not pick, and why.
 * - `questions`: questions it asked, open ones first, then the latest first.
 * - `recent`: its latest events, newest first.
 */
export const aiTeammateProfileResponse = z.object({
  teammate: aiTeammate,
  works_in: z.array(mode),
  provider: z.string().min(1),
  timer: z.object({ interval_ms: z.number().int().positive() }).nullable(),
  steps: z.array(aiProfileStep),
  now: z.array(aiProfileCard),
  next: z.array(aiProfileCard),
  not_next: z.array(z.object({ card, reason: z.string().min(1) })),
  questions: z.array(questionView),
  recent: z.array(cardEvent),
});
export type AiTeammateProfileResponse = z.infer<typeof aiTeammateProfileResponse>;

/**
 * `POST /teammates/:id/modes`: a person sets the mode they work one step in.
 * The mode must be in the function's `modes.allowed`, and only the person may
 * change their own profile, since there is no sign-in yet to say who is
 * asking. A change appends a `mode_changed` event, which reaches every board
 * over `GET /events`; setting the mode the person has already chosen appends
 * nothing. The answer is the profile as it now stands.
 */
export const setModeRequest = z.strictObject({ actor: teammateId, function_id: functionId, mode });
export type SetModeRequest = z.infer<typeof setModeRequest>;

/**
 * `POST /teammates/:id/roles`: a person sets the roles someone holds, their
 * own or a teammate's. `roles` is the whole list from now on, first role
 * first; `was` is the list the caller's view showed, so a change made after
 * someone else's is refused with 409 rather than overwriting it. A change
 * appends a `roles_changed` event; asking for the roles the person already
 * holds appends nothing. The answer is the teammate as they now stand.
 */
export const setRolesRequest = z.strictObject({ actor: teammateId, roles: teammateRoles, was: teammateRoles });
export type SetRolesRequest = z.infer<typeof setRolesRequest>;

export const teammateResponse = z.object({ teammate: humanTeammate });
export type TeammateResponse = z.infer<typeof teammateResponse>;

/**
 * Why the API refused a request. `unauthorized` (401) is a GitHub webhook
 * whose signature does not match; `unavailable` (503) is the webhook endpoint
 * when no secret is configured, so it cannot check any signature.
 */
export const apiErrorCode = z.enum([
  "invalid_request",
  "unauthorized",
  "not_found",
  "conflict",
  "forbidden",
  "rule_violation",
  "unavailable",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCode>;

/** Every 4xx body, and the webhook endpoint's 503. `reason` is a sentence for people; `issues` lists zod's findings for a bad body. */
export const apiError = z.object({
  error: apiErrorCode,
  reason: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiError>;

/**
 * What `POST /api/github/webhook` did with one delivery. Every outcome but a
 * bad signature or a malformed payload is answered 200, so GitHub does not
 * report or retry a delivery the board chose not to record:
 * - `recorded`: `events` were appended to the card `card_id`. A `reason`
 *   here says why the card did not move although the delivery would move
 *   it, because its sender may not under the owner's mode (`mayMoveCard`).
 * - `ignored`: nothing was recorded, because the event is not one the board
 *   maps, or names no card on the board, or `reason` says otherwise.
 * - `refused`: the delivery names a card, but recording it would break a
 *   rule, such as a merge without a person's approval; `reason` says which.
 * - `duplicate`: the delivery (`X-GitHub-Delivery`) was recorded before.
 */
export const webhookResponse = z.object({
  outcome: z.enum(["recorded", "ignored", "refused", "duplicate"]),
  delivery: z.string().min(1),
  card_id: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  events: z.array(cardEvent),
});
export type WebhookResponse = z.infer<typeof webhookResponse>;
