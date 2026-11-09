// Domain schemas shared by apps/web and apps/api: teammates, cards, questions
// and the append-only event stream. The model is described in
// docs/architecture.md ("Domain model"). Field names are snake_case, like the
// architecture doc and the function files in process/.
import { z } from "zod";
import { functionMode, functionRole } from "./functionFile.ts";

const id = z.string().min(1);
const timestamp = z.iso.datetime({ offset: true });

export const teammateId = id;
export const cardId = id;
export const questionId = id;
export const eventId = id;

/**
 * A function's `name` from its file in process/functions/. Checked only for
 * shape (snake_case); which functions exist is read from process/ at runtime.
 */
export const functionId = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected a snake_case function name");

/** The modes defined once in functionFile.ts, from process/template.md. */
export const mode = functionMode;
export type Mode = z.infer<typeof mode>;

/**
 * The mode a person works each of their functions in, keyed by function id.
 * Only the modes the person has chosen are present; it is derived from their
 * `mode_changed` events (`deriveProfile`) and never stored on its own.
 */
export const processProfile = z.record(functionId, mode);
export type ProcessProfile = z.infer<typeof processProfile>;

/**
 * A person's role on the team. The roles that own a chain of functions are
 * the function roles from process/template.md, less `team`: `team` owns the
 * shared steps anyone may carry out, so it names a kind of function, not a
 * kind of person. The product owner owns the order of the board and the
 * milestone but no chain of functions yet, so `po` is the one role added here.
 * The board seats people and labels their avatars by this role.
 */
export const teammateRole = z.enum(["po", ...functionRole.exclude(["team"]).options]);
export type TeammateRole = z.infer<typeof teammateRole>;

/**
 * A person on the team: a role and the mode they work each of their functions
 * in. `process_profile` is derived from the event stream when the teammate is
 * read; the store keeps only id, kind, name and role.
 */
export const humanTeammate = z.object({
  kind: z.literal("human"),
  id: teammateId,
  name: z.string().min(1),
  role: teammateRole,
  process_profile: processProfile,
});
export type HumanTeammate = z.infer<typeof humanTeammate>;

/** An AI teammate: it has no role and no process profile; it works in the modes of the people it helps. */
export const aiTeammate = z.object({ kind: z.literal("ai"), id: teammateId, name: z.string().min(1) });
export type AiTeammate = z.infer<typeof aiTeammate>;

export const teammate = z.discriminatedUnion("kind", [humanTeammate, aiTeammate]);
export type Teammate = z.infer<typeof teammate>;

export const cardStatus = z.enum(["backlog", "ready", "in_progress", "needs_input", "review", "done"]);
export type CardStatus = z.infer<typeof cardStatus>;

/**
 * A card's status. `needs_input` must say who the card waits on and which
 * question is open; every other state must not (the objects are strict, so a
 * stray `waiting_on` is rejected rather than silently dropped).
 */
export const status = z.discriminatedUnion("state", [
  z.strictObject({ state: cardStatus.exclude(["needs_input"]) }),
  z.strictObject({ state: z.literal("needs_input"), waiting_on: teammateId, question_id: questionId }),
]);
export type Status = z.infer<typeof status>;

/** Only `depends_on` is stored; "unblocks" is the same link read from the other card. */
export const cardLink = z.object({ relation: z.literal("depends_on"), card_id: cardId });
export type CardLink = z.infer<typeof cardLink>;

export const card = z.object({
  id: cardId,
  title: z.string().min(1),
  function_id: functionId,
  owner: teammateId,
  status,
  milestone: z.string().min(1).optional(),
  links: z.array(cardLink),
});
export type Card = z.infer<typeof card>;

/**
 * The ids of the cards `card` depends on that are not done. A card with an
 * unfinished dependency may not be picked, so nobody, person or AI, works on
 * input that is not settled. A link to a card that is not in `cards` counts as
 * unfinished.
 */
export function unfinishedDependencies(card: Card, cards: readonly Card[]): string[] {
  return card.links
    .filter((link) => cards.find((c) => c.id === link.card_id)?.status.state !== "done")
    .map((link) => link.card_id);
}

/**
 * A question asked on a card. `answer` and `decided_by` are set together.
 * In every protocol `decides` is human, so `decided_by` must be a human
 * teammate; the schema cannot see the teammate list, so check that with
 * `decidedByHuman`.
 */
export const question = z
  .object({
    id: questionId,
    card_id: cardId,
    asked_by: teammateId,
    asked_of: teammateId,
    text: z.string().min(1),
    why_it_blocks: z.string().min(1),
    answer: z.string().min(1).optional(),
    decided_by: teammateId.optional(),
  })
  .refine((q) => (q.answer === undefined) === (q.decided_by === undefined), {
    message: "answer and decided_by are set together",
    path: ["decided_by"],
  });
export type Question = z.infer<typeof question>;

/** False when the question is decided by anyone but a known human teammate. */
export function decidedByHuman(q: Question, teammates: readonly Teammate[]): boolean {
  if (q.decided_by === undefined) return true;
  return teammates.some((t) => t.id === q.decided_by && t.kind === "human");
}

export const cycleId = id;

/**
 * A cycle (the design's "Sprint 14"): a named time window on the board. The
 * cycle log is every event whose `at` falls in [starts_at, ends_at).
 */
export const cycle = z
  .object({ id: cycleId, name: z.string().min(1), starts_at: timestamp, ends_at: timestamp })
  .refine((c) => Date.parse(c.starts_at) < Date.parse(c.ends_at), {
    message: "a cycle must end after it starts",
    path: ["ends_at"],
  });
export type Cycle = z.infer<typeof cycle>;

const cardEventBase = { id: eventId, card_id: cardId, actor: teammateId, at: timestamp };
const teammateEventBase = { id: eventId, teammate_id: teammateId, actor: teammateId, at: timestamp };

/**
 * An event whose subject is a card, so it carries `card_id`. The card log is
 * these events for one card. Question and card state are derived from them:
 * `asked` opens a question, `answered` closes it (its actor is the decider).
 */
export const cardEvent = z.discriminatedUnion("type", [
  z.object({ ...cardEventBase, type: z.literal("picked"), mode }),
  z.object({
    ...cardEventBase,
    type: z.literal("asked"),
    question_id: questionId,
    asked_of: teammateId,
    text: z.string().min(1),
    why_it_blocks: z.string().min(1),
  }),
  z.object({ ...cardEventBase, type: z.literal("answered"), question_id: questionId, answer: z.string().min(1) }),
  z.object({
    ...cardEventBase,
    type: z.literal("check_ran"),
    check: z.enum(["structural", "consistency", "human"]),
    passed: z.boolean(),
    summary: z.string().min(1),
  }),
  z.object({ ...cardEventBase, type: z.literal("status_changed"), from: cardStatus, to: status }),
  z.object({ ...cardEventBase, type: z.literal("report_posted"), text: z.string().min(1) }),
]);
export type CardEvent = z.infer<typeof cardEvent>;
export type CardEventType = CardEvent["type"];

/**
 * An event whose subject is a teammate, so it carries `teammate_id` and no
 * `card_id`. `mode_changed` records a person setting the mode they work one
 * function in: `from` is the mode they had chosen before, or null when they
 * had not chosen one and the function's `modes.default` applied; `to` is the
 * new mode. A person's process profile is derived from these events.
 */
export const teammateEvent = z.discriminatedUnion("type", [
  z.object({
    ...teammateEventBase,
    type: z.literal("mode_changed"),
    function_id: functionId,
    from: mode.nullable(),
    to: mode,
  }),
]);
export type TeammateEvent = z.infer<typeof teammateEvent>;
export type ModeChangedEvent = Extract<TeammateEvent, { type: "mode_changed" }>;

/**
 * One entry in the append-only event stream: a card event or a teammate
 * event. The card, board and cycle logs are queries over these. An event about
 * the whole team would carry neither `card_id` nor `teammate_id`; there is no
 * such event type yet.
 */
export const streamEvent = z.discriminatedUnion("type", [...cardEvent.options, ...teammateEvent.options]);
export type StreamEvent = z.infer<typeof streamEvent>;
export type StreamEventType = StreamEvent["type"];

/** What an event is about: a card, a teammate, or the team as a whole. */
export type EventSubject = { kind: "card"; id: string } | { kind: "teammate"; id: string } | { kind: "team" };

export function eventSubject(e: StreamEvent): EventSubject {
  if ("card_id" in e) return { kind: "card", id: e.card_id };
  if ("teammate_id" in e) return { kind: "teammate", id: e.teammate_id };
  return { kind: "team" };
}

export function isCardEvent(e: StreamEvent): e is CardEvent {
  return eventSubject(e).kind === "card";
}

/**
 * A person's process profile from the stream: for each function, the `to` of
 * their latest `mode_changed` event. A function with no such event is absent,
 * so its `modes.default` applies. `events` must be in stream order.
 */
export function deriveProfile(events: readonly StreamEvent[], teammateId: string): ProcessProfile {
  const profile: ProcessProfile = {};
  for (const e of events) if (e.type === "mode_changed" && e.teammate_id === teammateId) profile[e.function_id] = e.to;
  return profile;
}
