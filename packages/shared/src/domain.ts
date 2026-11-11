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
 * The board seats people and labels them by their roles.
 */
export const teammateRole = z.enum(["po", ...functionRole.exclude(["team"]).options]);
export type TeammateRole = z.infer<typeof teammateRole>;

/**
 * The roles a person holds: at least one, each once. The order is the
 * person's own: the first is their main role, which the board seats them by
 * and shows in their avatar. One person on a small team may hold every role.
 */
export const teammateRoles = z
  .array(teammateRole)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, { message: "a role is listed twice" });
export type TeammateRoles = z.infer<typeof teammateRoles>;

/**
 * A person on the team: the roles they hold and the mode they work each of
 * their functions in. Both `roles` and `process_profile` are derived from the
 * event stream when the teammate is read; the store keeps only id, kind and
 * name.
 */
export const humanTeammate = z.object({
  kind: z.literal("human"),
  id: teammateId,
  name: z.string().min(1),
  roles: teammateRoles,
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

/** Whether the time `at` falls in the cycle's window, [starts_at, ends_at). */
export function inCycle(c: Cycle, at: string): boolean {
  const t = Date.parse(at);
  return Date.parse(c.starts_at) <= t && t < Date.parse(c.ends_at);
}

/**
 * The board's current cycle at `now`: the cycle whose window holds `now`, or,
 * between cycles, the one that ended last, marked `ended`, so the board keeps
 * showing the cycle it has just been through. A cycle that has not started is
 * never current. If two windows hold `now`, the one that started last wins.
 * Undefined when no cycle has started.
 */
export function currentCycle(cycles: readonly Cycle[], now: Date): { cycle: Cycle; ended: boolean } | undefined {
  const t = now.getTime();
  const latest = (pick: (c: Cycle) => number, list: readonly Cycle[]) =>
    list.reduce<Cycle | undefined>((best, c) => (best === undefined || pick(c) > pick(best) ? c : best), undefined);
  const running = latest((c) => Date.parse(c.starts_at), cycles.filter((c) => inCycle(c, now.toISOString())));
  if (running) return { cycle: running, ended: false };
  const ended = latest((c) => Date.parse(c.ends_at), cycles.filter((c) => Date.parse(c.ends_at) <= t));
  return ended && { cycle: ended, ended: true };
}

const cardEventBase = { id: eventId, card_id: cardId, actor: teammateId, at: timestamp };
const teammateEventBase = { id: eventId, teammate_id: teammateId, actor: teammateId, at: timestamp };

const url = z.url();
const pullRequestNumber = z.int().positive();

/**
 * An event whose subject is a card, so it carries `card_id`. The card log is
 * these events for one card. Question and card state are derived from them:
 * `asked` opens a question, `answered` closes it (its actor is the decider).
 *
 * The development loop (docs/dev-loop.md) adds the events that report work
 * done in the card's workspace, which today is a GitHub repository; the API
 * records them from GitHub's webhooks. `workspace_linked` says a branch named
 * for the card exists, `work_pushed` that commits reached it,
 * `review_requested` that a pull request for the card is open for review, and
 * `approved` and `changes_requested` a person's review of it. A card reaches
 * `done` from a merge only after an `approved` by a person.
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
    /** Where the check's own record is, such as a CI run; absent for a check with no page. */
    url: url.optional(),
  }),
  z.object({ ...cardEventBase, type: z.literal("status_changed"), from: cardStatus, to: status }),
  z.object({ ...cardEventBase, type: z.literal("report_posted"), text: z.string().min(1) }),
  z.object({
    ...cardEventBase,
    type: z.literal("workspace_linked"),
    workspace: z.literal("github"),
    /** The repository as `owner/name`. */
    repository: z.string().min(1),
    branch: z.string().min(1),
    url,
  }),
  z.object({
    ...cardEventBase,
    type: z.literal("work_pushed"),
    branch: z.string().min(1),
    head_sha: z.string().min(1),
    /** How many commits the push carried. */
    commits: z.int().nonnegative(),
    forced: z.boolean(),
    url,
  }),
  z.object({
    ...cardEventBase,
    type: z.literal("review_requested"),
    pull_request: pullRequestNumber,
    title: z.string().min(1),
    url,
  }),
  z.object({ ...cardEventBase, type: z.literal("approved"), pull_request: pullRequestNumber, url }),
  z.object({
    ...cardEventBase,
    type: z.literal("changes_requested"),
    pull_request: pullRequestNumber,
    url,
    /** The review's text, when the reviewer wrote one. */
    text: z.string().min(1).optional(),
  }),
]);
export type CardEvent = z.infer<typeof cardEvent>;
export type CardEventType = CardEvent["type"];

/**
 * An event whose subject is a teammate, so it carries `teammate_id` and no
 * `card_id`. `mode_changed` records a person setting the mode they work one
 * function in: `from` is the mode they had chosen before, or null when they
 * had not chosen one and the function's `modes.default` applied; `to` is the
 * new mode. A person's process profile is derived from these events.
 * `roles_changed` records the roles a person holds: `from` is the list they
 * held before, empty when they join the team, and `to` the list they hold
 * from now on. A person's roles are derived from these events.
 */
export const teammateEvent = z.discriminatedUnion("type", [
  z.object({
    ...teammateEventBase,
    type: z.literal("mode_changed"),
    function_id: functionId,
    from: mode.nullable(),
    to: mode,
  }),
  z.object({
    ...teammateEventBase,
    type: z.literal("roles_changed"),
    from: z.union([z.array(teammateRole).length(0), teammateRoles]),
    to: teammateRoles,
  }),
]);
export type TeammateEvent = z.infer<typeof teammateEvent>;
export type ModeChangedEvent = Extract<TeammateEvent, { type: "mode_changed" }>;
export type RolesChangedEvent = Extract<TeammateEvent, { type: "roles_changed" }>;

/**
 * The logs people read: one card's, the board's, a cycle's and a teammate's.
 * Each is a query over the one event stream, and each has a team-wide filter
 * over event types (`LogFilters`).
 */
export const logName = z.enum(["card", "board", "cycle", "teammate"]);
export type LogName = z.infer<typeof logName>;

/** Every card event type, in schema order, read from `cardEvent`. */
export const cardEventType = z.enum(cardEvent.options.map((o) => o.shape.type.value));

/**
 * Every event type in the stream, in schema order: the card and teammate
 * event types read from their schemas, then the team event types. The team
 * event `log_filter_changed` names event types itself, so its own type is
 * written here by hand, and a test checks this list against `streamEvent`.
 */
export const streamEventType = z.enum([
  ...cardEventType.options,
  ...teammateEvent.options.map((o) => o.shape.type.value),
  "log_filter_changed" as const,
]);

/**
 * The event types a log hides. A filter stores what is hidden, not what is
 * shown, so a log shows every event type until someone hides one, and an
 * event type added to the schema later shows in every log at once.
 */
export const hiddenEventTypes = z
  .array(streamEventType)
  .refine((types) => new Set(types).size === types.length, { message: "an event type is listed twice" });

const teamEventBase = { id: eventId, actor: teammateId, at: timestamp };

/**
 * An event whose subject is the whole team, so it carries neither `card_id`
 * nor `teammate_id`. `log_filter_changed` records a person setting which event
 * types one log hides for the whole team: `hidden` is the whole set it hides
 * from now on, and `was_hidden` the set it hid before. The current filters
 * are derived from these events (`deriveLogFilters`).
 */
export const teamEvent = z.discriminatedUnion("type", [
  z.object({
    ...teamEventBase,
    type: z.literal("log_filter_changed"),
    log: logName,
    hidden: hiddenEventTypes,
    was_hidden: hiddenEventTypes,
  }),
]);
export type TeamEvent = z.infer<typeof teamEvent>;
export type LogFilterChangedEvent = Extract<TeamEvent, { type: "log_filter_changed" }>;

/**
 * One entry in the append-only event stream: a card, teammate or team event.
 * The card, board and cycle logs are queries over these.
 */
export const streamEvent = z.discriminatedUnion("type", [
  ...cardEvent.options,
  ...teammateEvent.options,
  ...teamEvent.options,
]);
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

/**
 * A person's roles from the stream: the `to` of their latest `roles_changed`
 * event, or an empty list before they have joined. `events` must be in stream
 * order.
 */
export function deriveRoles(events: readonly StreamEvent[], teammateId: string): TeammateRole[] {
  let roles: TeammateRole[] = [];
  for (const e of events) if (e.type === "roles_changed" && e.teammate_id === teammateId) roles = [...e.to];
  return roles;
}

/** Whether two role lists are the same roles in the same order; the order matters, since the first is the main role. */
export function sameRoles(a: readonly TeammateRole[], b: readonly TeammateRole[]): boolean {
  return a.length === b.length && a.every((r, i) => r === b[i]);
}

/** The event types each log hides, for every log; an empty list shows every event type. */
export const logFilters = z.object({
  card: hiddenEventTypes,
  board: hiddenEventTypes,
  cycle: hiddenEventTypes,
  teammate: hiddenEventTypes,
});
export type LogFilters = z.infer<typeof logFilters>;

/** The filters before anyone has changed one: every log shows every event type. */
export function defaultLogFilters(): LogFilters {
  return { card: [], board: [], cycle: [], teammate: [] };
}

/**
 * The team's log filters from the stream: for each log, the `hidden` of the
 * latest `log_filter_changed` event about it. `events` must be in stream order.
 */
export function deriveLogFilters(events: readonly StreamEvent[]): LogFilters {
  const filters = defaultLogFilters();
  for (const e of events) if (e.type === "log_filter_changed") filters[e.log] = [...e.hidden];
  return filters;
}

/** The types in `types`, once each, in schema order, so equal sets compare equal. */
export function normalizeEventTypes(types: readonly StreamEventType[]): StreamEventType[] {
  const set = new Set(types);
  return streamEventType.options.filter((t) => set.has(t));
}

/** Whether two lists name the same event types, in any order. */
export function sameEventTypes(a: readonly StreamEventType[], b: readonly StreamEventType[]): boolean {
  const left = normalizeEventTypes(a);
  const right = normalizeEventTypes(b);
  return left.length === right.length && left.every((t, i) => t === right[i]);
}

/**
 * The event types that can appear in a log, which its filter offers. A card
 * log holds only card events; the board, cycle and teammate logs can hold any.
 */
export function logEventTypes(log: LogName): readonly StreamEventType[] {
  return log === "card" ? cardEventType.options : streamEventType.options;
}

/**
 * The events a log shows under the team's filters: those whose type its
 * filter does not hide, in the order given. The filter is a view setting; it
 * never removes an event from the stream or from anything else that reads it.
 */
export function shownInLog<E extends StreamEvent>(events: readonly E[], filters: LogFilters, log: LogName): E[] {
  const hidden = new Set<StreamEventType>(filters[log]);
  return events.filter((e) => !hidden.has(e.type));
}
