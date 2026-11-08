// Domain schemas shared by apps/web and apps/api: teammates, cards, questions
// and the append-only event stream. The model is described in
// docs/architecture.md ("Domain model"). Field names are snake_case, like the
// architecture doc and the function files in process/.
import { z } from "zod";
import { functionMode } from "./functionFile.ts";

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

/** The mode a person works each of their functions in, keyed by function id. */
export const processProfile = z.record(functionId, mode);
export type ProcessProfile = z.infer<typeof processProfile>;

export const teammate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human"), id: teammateId, name: z.string().min(1), process_profile: processProfile }),
  z.object({ kind: z.literal("ai"), id: teammateId, name: z.string().min(1) }),
]);
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

const eventBase = { id: eventId, card_id: cardId, actor: teammateId, at: timestamp };

/**
 * One entry in the append-only event stream. The card, board and cycle logs
 * are queries over these. Question and card state are derived from them:
 * `asked` opens a question, `answered` closes it (its actor is the decider).
 */
export const cardEvent = z.discriminatedUnion("type", [
  z.object({ ...eventBase, type: z.literal("picked"), mode }),
  z.object({
    ...eventBase,
    type: z.literal("asked"),
    question_id: questionId,
    asked_of: teammateId,
    text: z.string().min(1),
    why_it_blocks: z.string().min(1),
  }),
  z.object({ ...eventBase, type: z.literal("answered"), question_id: questionId, answer: z.string().min(1) }),
  z.object({
    ...eventBase,
    type: z.literal("check_ran"),
    check: z.enum(["structural", "consistency", "human"]),
    passed: z.boolean(),
    summary: z.string().min(1),
  }),
  z.object({ ...eventBase, type: z.literal("status_changed"), from: cardStatus, to: status }),
  z.object({ ...eventBase, type: z.literal("report_posted"), text: z.string().min(1) }),
]);
export type CardEvent = z.infer<typeof cardEvent>;
export type CardEventType = CardEvent["type"];
