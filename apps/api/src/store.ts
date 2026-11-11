// The event store: the append-only event stream plus the teammates, cycles
// and cards it refers to. An event's subject is a card (`card_id`), a
// teammate (`teammate_id`) or the whole team (neither). The card, board and
// cycle logs are three queries over the one `events` table
// (docs/architecture.md, "Logs are views of one event stream"); no log is
// stored on its own. A card's status is derived from
// its `status_changed` events, a person's process profile from their
// `mode_changed` events, their roles from their `roles_changed` events, and
// the team's log filters from the `log_filter_changed` events, in the same
// way. The filters are a view setting: no query here applies them.
import { and, asc, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import {
  card as cardSchema,
  cardEvent,
  cycle as cycleSchema,
  deriveLogFilters,
  deriveProfile,
  deriveRoles,
  humanTeammate,
  sameEventTypes,
  sameRoles,
  streamEvent,
  teammate as teammateSchema,
  type Card,
  type CardEvent,
  type Cycle,
  type LogFilterChangedEvent,
  type LogFilters,
  type LogName,
  type Mode,
  type ModeChangedEvent,
  type Question,
  type RolesChangedEvent,
  type Status,
  type StreamEvent,
  type StreamEventType,
  type Teammate,
  type TeammateRole,
  type ProcessProfile,
} from "@workbench/shared";
import { z } from "zod";
import type { Db } from "./db/client.ts";
import { cards, cycles, events, teammates, type EventPayload } from "./db/schema.ts";

/** A card as stored: everything but its status, which comes from events. */
export const cardRecord = cardSchema.omit({ status: true });
export type CardRecord = Omit<Card, "status">;

/**
 * A teammate as added: everything but a person's process profile, which
 * comes from events. A person's `roles` are the roles they join with:
 * `addTeammate` records them as their first `roles_changed` event, and the
 * row keeps only id, kind and name. Strict, so a profile passed in by mistake
 * is refused rather than silently dropped.
 */
export const teammateRecord = z.discriminatedUnion("kind", [
  humanTeammate.omit({ process_profile: true }).strict(),
  z.strictObject({ kind: z.literal("ai"), id: z.string().min(1), name: z.string().min(1) }),
]);
export type TeammateRecord = z.infer<typeof teammateRecord>;

/** A card's status before any `status_changed` event. */
export const INITIAL_STATUS: Status = { state: "backlog" };

/**
 * What kind of rule a write broke, so callers such as the HTTP API can answer
 * with the right status: `conflict` when the stream has moved on (a stale
 * `from`), `forbidden` when the actor may not do this (a non-human answer),
 * `unknown_function` when process/ has no such function, `not_found` for a
 * missing record, `rule_violation` for anything else.
 */
export type StoreErrorCode = "conflict" | "forbidden" | "unknown_function" | "not_found" | "rule_violation";

export class StoreError extends Error {
  override name = "StoreError";
  readonly code: StoreErrorCode;
  constructor(message: string, code: StoreErrorCode = "rule_violation") {
    super(message);
    this.code = code;
  }
}

type EventRow = typeof events.$inferSelect;
type EventInsert = typeof events.$inferInsert;

/** The columns that name an event's subject; an event about the whole team sets neither. */
function subjectColumns(event: StreamEvent): { cardId: string | null; teammateId: string | null } {
  return {
    cardId: "card_id" in event ? event.card_id : null,
    teammateId: "teammate_id" in event ? event.teammate_id : null,
  };
}

const COLUMN_FIELDS = new Set(["id", "card_id", "teammate_id", "actor", "at", "type"]);

function toRow(event: StreamEvent): EventInsert {
  const { id, actor, at, type } = event;
  const payload: EventPayload = Object.fromEntries(Object.entries(event).filter(([key]) => !COLUMN_FIELDS.has(key)));
  return { id, ...subjectColumns(event), actor, at, type, atMs: Date.parse(at), payload };
}

function fromRow(row: EventRow): StreamEvent {
  return streamEvent.parse({
    ...row.payload,
    id: row.id,
    ...(row.cardId === null ? {} : { card_id: row.cardId }),
    ...(row.teammateId === null ? {} : { teammate_id: row.teammateId }),
    actor: row.actor,
    at: row.at,
    type: row.type,
  });
}

/** A teammate from their row and the teammate events their roles and process profile are derived from. */
function teammateFromRow(row: typeof teammates.$inferSelect, changes: readonly StreamEvent[]): Teammate {
  return teammateSchema.parse(
    row.kind === "human"
      ? {
          kind: row.kind,
          id: row.id,
          name: row.name,
          roles: deriveRoles(changes, row.id),
          process_profile: deriveProfile(changes, row.id),
        }
      : { kind: row.kind, id: row.id, name: row.name },
  );
}

/** The event types a person's settings are derived from. */
const SETTING_TYPES: StreamEventType[] = ["mode_changed", "roles_changed"];

/**
 * Every `mode_changed` and `roles_changed` event, or one teammate's, in
 * stream order. Both queries filter on `teammate_id` so SQLite searches
 * `events_teammate_seq` instead of scanning every card event. For all
 * teammates the filter is `teammate_id > ''` (ids are never empty) with the
 * order applied here: EXPLAIN QUERY PLAN shows SQLite scans the table for
 * `IS NOT NULL`, or for any range filter combined with `ORDER BY seq`.
 */
async function settingChanges(db: Db, teammateId?: string): Promise<StreamEvent[]> {
  const isSettingChange = inArray(events.type, SETTING_TYPES);
  if (teammateId !== undefined) {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.teammateId, teammateId), isSettingChange))
      .orderBy(asc(events.seq));
    return rows.map(fromRow);
  }
  const rows = await db
    .select()
    .from(events)
    .where(and(gt(events.teammateId, ""), isSettingChange));
  return rows.sort((a, b) => a.seq - b.seq).map(fromRow);
}

/**
 * The mode a person has chosen for one function, or null when they have not
 * chosen one and the function's default applies.
 */
export async function chosenMode(db: Db, teammateId: string, functionId: string): Promise<Mode | null> {
  return deriveProfile(await settingChanges(db, teammateId), teammateId)[functionId] ?? null;
}

/** The roles a person holds now, first role first; empty before they have joined. */
export async function heldRoles(db: Db, teammateId: string): Promise<TeammateRole[]> {
  return deriveRoles(await settingChanges(db, teammateId), teammateId);
}

/**
 * The team's filter for each log, derived from its `log_filter_changed`
 * events: the latest change per log wins, and a log nobody has changed shows
 * every event type.
 */
export async function logFilters(db: Db): Promise<LogFilters> {
  // Served by the (type, seq) index, so the board does not scan the stream for the few filter changes.
  const rows = await db.select().from(events).where(eq(events.type, "log_filter_changed")).orderBy(asc(events.seq));
  return deriveLogFilters(rows.map(fromRow));
}

interface Pending {
  statuses: Map<string, Status>;
  /** Keyed by teammate id and function id. */
  modes: Map<string, Mode | null>;
  /** Keyed by teammate id. */
  roles: Map<string, TeammateRole[]>;
  /** What earlier events in the write set each log's filter to. */
  filters: Map<LogName, StreamEventType[]>;
}

/**
 * A filter change must come from a person, must change what the log hides,
 * and must name as `was_hidden` what the log hides now, so two changes made
 * from the same view cannot both win.
 */
async function checkLogFilterChange(db: Db, event: LogFilterChangedEvent, pending: Pending): Promise<void> {
  const [actor] = await db.select().from(teammates).where(eq(teammates.id, event.actor));
  if (!actor) throw new StoreError(`${event.id}: no teammate '${event.actor}'`, "not_found");
  if (actor.kind !== "human") {
    throw new StoreError(`${event.id}: a log's filter is set by a person, not ${event.actor}`, "forbidden");
  }
  // Staleness first: a change made from an out-of-date view is a conflict, whatever it asks for.
  const current = pending.filters.get(event.log) ?? (await logFilters(db))[event.log];
  if (!sameEventTypes(current, event.was_hidden)) {
    const hides = (types: readonly string[]) => (types.length === 0 ? "nothing" : types.join(", "));
    throw new StoreError(
      `${event.id}: the ${event.log} log hides ${hides(current)}, not ${hides(event.was_hidden)}`,
      "conflict",
    );
  }
  if (sameEventTypes(event.hidden, event.was_hidden)) {
    throw new StoreError(`${event.id}: a filter change must change what the ${event.log} log hides`);
  }
  pending.filters.set(event.log, event.hidden);
}

/**
 * A mode change must be about a person, must change the mode, and must name
 * as `from` the mode the person has now, so two changes made from the same
 * profile cannot both win.
 */
async function checkModeChange(db: Db, event: ModeChangedEvent, pending: Pending): Promise<void> {
  const [subject] = await db.select().from(teammates).where(eq(teammates.id, event.teammate_id));
  if (!subject) throw new StoreError(`${event.id}: no teammate '${event.teammate_id}'`, "not_found");
  if (subject.kind !== "human") {
    throw new StoreError(`${event.id}: ${event.teammate_id} is not a person and has no process profile`);
  }
  if (event.from === event.to) throw new StoreError(`${event.id}: a mode change must change the mode, not keep ${event.to}`);
  const key = JSON.stringify([event.teammate_id, event.function_id]);
  const current = pending.modes.has(key)
    ? (pending.modes.get(key) ?? null)
    : await chosenMode(db, event.teammate_id, event.function_id);
  if (current !== event.from) {
    throw new StoreError(
      `${event.id}: ${event.teammate_id} works ${event.function_id} in ${current ?? "the default"}, not ${event.from ?? "the default"}`,
      "conflict",
    );
  }
  pending.modes.set(key, event.to);
}

/**
 * A roles change must be about a person, must be made by a person, must
 * change the roles, and must name as `from` the roles the person holds now, so
 * two changes made from the same view cannot both win. Joining is the change
 * from no roles.
 */
async function checkRolesChange(db: Db, event: RolesChangedEvent, pending: Pending): Promise<void> {
  const [subject] = await db.select().from(teammates).where(eq(teammates.id, event.teammate_id));
  if (!subject) throw new StoreError(`${event.id}: no teammate '${event.teammate_id}'`, "not_found");
  if (subject.kind !== "human") throw new StoreError(`${event.id}: ${event.teammate_id} is not a person and holds no roles`);
  const [actor] = await db.select().from(teammates).where(eq(teammates.id, event.actor));
  if (!actor) throw new StoreError(`${event.id}: no teammate '${event.actor}'`, "not_found");
  if (actor.kind !== "human") throw new StoreError(`${event.id}: roles are set by a person, not ${event.actor}`, "forbidden");
  const current = pending.roles.get(event.teammate_id) ?? (await heldRoles(db, event.teammate_id));
  const list = (roles: readonly string[]) => (roles.length === 0 ? "no roles" : roles.join(", "));
  if (!sameRoles(current, event.from)) {
    throw new StoreError(`${event.id}: ${event.teammate_id} holds ${list(current)}, not ${list(event.from)}`, "conflict");
  }
  if (sameRoles(event.from, event.to)) {
    throw new StoreError(`${event.id}: a roles change must change the roles, not keep ${list(event.to)}`);
  }
  pending.roles.set(event.teammate_id, [...event.to]);
}

/**
 * Check an event against the stream so far: it must parse; a status change's
 * `from` must be the card's current state; an answer must come from a human,
 * because in every protocol `decides` is human; a mode change must pass
 * `checkModeChange`, a roles change `checkRolesChange`, and a filter change
 * `checkLogFilterChange`.
 * `pending` holds what earlier events in the same write have changed.
 */
async function checkEvent(db: Db, input: StreamEvent, pending: Pending): Promise<StreamEvent> {
  const event = streamEvent.parse(input);
  if (event.type === "status_changed") {
    const current = pending.statuses.get(event.card_id) ?? (await cardStatus(db, event.card_id));
    if (current.state !== event.from) {
      throw new StoreError(`${event.id}: card ${event.card_id} is ${current.state}, not ${event.from}`, "conflict");
    }
    pending.statuses.set(event.card_id, event.to);
  }
  if (event.type === "mode_changed") await checkModeChange(db, event, pending);
  if (event.type === "roles_changed") await checkRolesChange(db, event, pending);
  if (event.type === "log_filter_changed") await checkLogFilterChange(db, event, pending);
  if (event.type === "answered") {
    const [actor] = await db.select().from(teammates).where(eq(teammates.id, event.actor));
    if (actor?.kind !== "human") {
      throw new StoreError(`${event.id}: answers are decided by a human, not ${event.actor}`, "forbidden");
    }
  }
  return event;
}

/** An event with its position in the stream, which the SSE stream uses as its id. */
export interface StoredEvent {
  seq: number;
  event: StreamEvent;
}

type Listener = (stored: StoredEvent) => void;
const listeners = new WeakMap<Db, Set<Listener>>();
const writeQueues = new WeakMap<Db, Promise<unknown>>();

/**
 * Run writes to one database one at a time, so the check of an event and its
 * insert cannot interleave with another write's.
 */
function serialized<T>(db: Db, work: () => Promise<T>): Promise<T> {
  const result = (writeQueues.get(db) ?? Promise.resolve()).then(work);
  writeQueues.set(
    db,
    result.catch(() => undefined),
  );
  return result;
}

/**
 * Call `listener` with every event appended to `db` from now on, once each,
 * in stream order. Returns a function that stops the calls. Only writes made
 * through this module in this process are seen; a reader that needs anything
 * else catches up from the table itself with `eventsAfter`.
 */
export function onAppend(db: Db, listener: Listener): () => void {
  let set = listeners.get(db);
  if (!set) {
    set = new Set();
    listeners.set(db, set);
  }
  const own = set;
  own.add(listener);
  return () => {
    own.delete(listener);
  };
}

/**
 * Append several events as one write: each is checked against the stream as
 * it would stand after the ones before it, and either all are stored or none.
 * Returns them with their positions in the stream.
 */
export function appendEvents(db: Db, inputs: readonly StreamEvent[]): Promise<StoredEvent[]> {
  return serialized(db, async () => {
    if (inputs.length === 0) return [];
    const pending: Pending = { statuses: new Map(), modes: new Map(), roles: new Map(), filters: new Map() };
    const checked: StreamEvent[] = [];
    for (const input of inputs) checked.push(await checkEvent(db, input, pending));
    // One multi-row INSERT is one statement, so SQLite stores all rows or none.
    const inserted = await db.insert(events).values(checked.map(toRow)).returning({ seq: events.seq, id: events.id });
    const seqById = new Map(inserted.map((r) => [r.id, r.seq]));
    const stored = checked.map((event) => ({ seq: seqById.get(event.id) ?? 0, event }));
    // The events are stored by now; a failing listener must not fail the write.
    for (const s of stored) {
      for (const listener of listeners.get(db) ?? []) {
        try {
          listener(s);
        } catch (err) {
          console.error("onAppend listener failed", err);
        }
      }
    }
    return stored;
  });
}

/** Append one event to the stream. Events are never updated or deleted. */
export async function appendEvent(db: Db, input: StreamEvent): Promise<void> {
  await appendEvents(db, [input]);
}

/** Every event after position `seq` in the stream, oldest first, with positions. */
export async function eventsAfter(db: Db, seq: number): Promise<StoredEvent[]> {
  const rows = await db.select().from(events).where(gt(events.seq, seq)).orderBy(asc(events.seq));
  return rows.map((row) => ({ seq: row.seq, event: fromRow(row) }));
}

/** The position of the latest event, or 0 for an empty stream. */
export async function lastSeq(db: Db): Promise<number> {
  const [row] = await db.select({ seq: events.seq }).from(events).orderBy(desc(events.seq)).limit(1);
  return row?.seq ?? 0;
}

/** The `roles_changed` event `addTeammate` records when a person joins at `at`; none for an AI teammate. */
export function joiningEvent(t: TeammateRecord, at: string): RolesChangedEvent | undefined {
  if (t.kind !== "human") return undefined;
  return { id: `roles-${t.id}-joined`, type: "roles_changed", teammate_id: t.id, actor: t.id, at, from: [], to: [...t.roles] };
}

/**
 * Add a teammate. A person joins with the roles in `input`, recorded as a
 * `roles_changed` event from no roles, made by the person at `joinedAt`, with
 * the id `roles-<teammate id>-joined`; if that event is refused, the person
 * is not added. A person starts with no chosen modes; their process profile
 * grows from `mode_changed` events (see `profileEvents`).
 */
export async function addTeammate(db: Db, input: TeammateRecord, joinedAt: string = new Date().toISOString()): Promise<void> {
  const t = teammateRecord.parse(input);
  await db.insert(teammates).values({ id: t.id, kind: t.kind, name: t.name });
  const joined = joiningEvent(t, joinedAt);
  if (!joined) return;
  try {
    await appendEvents(db, [joined]);
  } catch (err) {
    // Nothing refers to the row yet, so it goes: a person never exists without roles.
    await db.delete(teammates).where(eq(teammates.id, t.id));
    throw err;
  }
}

/**
 * The `mode_changed` events that give a person with no chosen modes the
 * profile `profile`: one per function, from the default (`from: null`), made
 * by the person at `at`, with the id `<idPrefix><teammate id>-<function id>`.
 * Seeds and tests use it to start a person with a profile.
 */
export function profileEvents(teammateId: string, profile: ProcessProfile, at: string, idPrefix = "mode-"): ModeChangedEvent[] {
  return Object.entries(profile).map(([function_id, to]) => ({
    id: `${idPrefix}${teammateId}-${function_id}`,
    type: "mode_changed",
    teammate_id: teammateId,
    actor: teammateId,
    at,
    function_id,
    from: null,
    to,
  }));
}

export async function addCycle(db: Db, input: Cycle): Promise<void> {
  const c = cycleSchema.parse(input);
  await db.insert(cycles).values({
    id: c.id,
    name: c.name,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    startsAtMs: Date.parse(c.starts_at),
    endsAtMs: Date.parse(c.ends_at),
  });
}

/**
 * Add a card. `functionIds` are the function names read from process/
 * (see `loadFunctionIds`); the store never lists them itself.
 */
export async function addCard(db: Db, input: CardRecord, functionIds: ReadonlySet<string>): Promise<void> {
  const c = cardRecord.parse(input);
  if (!functionIds.has(c.function_id)) {
    throw new StoreError(`${c.id}: no function '${c.function_id}' in process/functions`, "unknown_function");
  }
  // A plain-number id joins the pool `addNumberedCard` counts from, which SQLite reads as a 64-bit integer.
  if (/^[0-9]+$/.test(c.id) && !Number.isSafeInteger(Number(c.id))) {
    throw new StoreError(`${c.id}: a numeric card id must be at most ${Number.MAX_SAFE_INTEGER}`, "rule_violation");
  }
  await db.insert(cards).values({
    id: c.id,
    title: c.title,
    functionId: c.function_id,
    owner: c.owner,
    milestone: c.milestone ?? null,
    links: c.links,
  });
}

/**
 * Add a card under the next number: one more than the highest card id on the
 * board that is a plain number ("1", "2", …), or "1" when there is none. Ids
 * that are not plain numbers, such as an old UUID or "invented-101", are
 * ignored. The number is read and the row written in one INSERT … SELECT.
 * Within one server process, which holds one connection, two creates at the
 * same time cannot take the same number. Across processes on one file (the
 * server and `team:cards`, say) two writers can read the same MAX; then the
 * primary key stops a duplicate, and the losing writer may instead fail with
 * SQLITE_BUSY, since no busy_timeout is set. Answers with the new card's id.
 */
export async function addNumberedCard(db: Db, input: Omit<CardRecord, "id">, functionIds: ReadonlySet<string>): Promise<string> {
  const c = cardRecord.omit({ id: true }).parse(input);
  if (!functionIds.has(c.function_id)) {
    throw new StoreError(`no function '${c.function_id}' in process/functions`, "unknown_function");
  }
  const row = await db.get<{ id: string }>(sql`
    INSERT INTO ${cards} (id, title, function_id, owner, milestone, links)
    SELECT CAST(COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 AS TEXT),
      ${c.title}, ${c.function_id}, ${c.owner}, ${c.milestone ?? null}, ${JSON.stringify(c.links)}
    FROM ${cards}
    WHERE id GLOB '[1-9]*' AND id NOT GLOB '*[^0-9]*'
    RETURNING id`);
  return row.id;
}

/** One teammate; a person comes with their roles and process profile derived from their teammate events. */
export async function getTeammate(db: Db, teammateId: string): Promise<Teammate | undefined> {
  const [row] = await db.select().from(teammates).where(eq(teammates.id, teammateId));
  if (!row) return undefined;
  return teammateFromRow(row, row.kind === "human" ? await settingChanges(db, teammateId) : []);
}

/** Every teammate; people come with their roles and process profiles derived from the stream. */
export async function listTeammates(db: Db): Promise<Teammate[]> {
  const rows = await db.select().from(teammates).orderBy(asc(teammates.id));
  const changes = await settingChanges(db);
  return rows.map((row) => teammateFromRow(row, changes));
}

export async function getCycle(db: Db, cycleId: string): Promise<Cycle | undefined> {
  const [row] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  return row && cycleSchema.parse({ id: row.id, name: row.name, starts_at: row.startsAt, ends_at: row.endsAt });
}

/** Every cycle, in the order they start. */
export async function listCycles(db: Db): Promise<Cycle[]> {
  const rows = await db.select().from(cycles).orderBy(asc(cycles.startsAtMs), asc(cycles.id));
  return rows.map((row) => cycleSchema.parse({ id: row.id, name: row.name, starts_at: row.startsAt, ends_at: row.endsAt }));
}

/** A card's current status: the `to` of its latest `status_changed` event. */
export async function cardStatus(db: Db, cardId: string): Promise<Status> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.cardId, cardId), eq(events.type, "status_changed")))
    .orderBy(desc(events.seq))
    .limit(1);
  const last = row && fromRow(row);
  return last?.type === "status_changed" ? last.to : INITIAL_STATUS;
}

function cardFromRow(row: typeof cards.$inferSelect, status: Status): Card {
  return cardSchema.parse({
    id: row.id,
    title: row.title,
    function_id: row.functionId,
    owner: row.owner,
    status,
    ...(row.milestone === null ? {} : { milestone: row.milestone }),
    links: row.links,
  });
}

/** One card with its status derived from the event stream. */
export async function getCard(db: Db, cardId: string): Promise<Card | undefined> {
  const [row] = await db.select().from(cards).where(eq(cards.id, cardId));
  return row && cardFromRow(row, await cardStatus(db, cardId));
}

/**
 * Questions rebuilt from `asked` and `answered` events, in the order they
 * were asked; the actor of `answered` is the decider. With `cardId`, only
 * that card's.
 */
export async function listQuestions(db: Db, options: { cardId?: string } = {}): Promise<Question[]> {
  const where = options.cardId === undefined ? undefined : eq(events.cardId, options.cardId);
  const rows = await db.select().from(events).where(where).orderBy(asc(events.seq));
  const byId = new Map<string, Question>();
  for (const row of rows) {
    const e = fromRow(row);
    if (e.type === "asked") {
      byId.set(e.question_id, {
        id: e.question_id,
        card_id: e.card_id,
        asked_by: e.actor,
        asked_of: e.asked_of,
        text: e.text,
        why_it_blocks: e.why_it_blocks,
      });
    } else if (e.type === "answered") {
      const q = byId.get(e.question_id);
      if (q) byId.set(e.question_id, { ...q, answer: e.answer, decided_by: e.actor });
    }
  }
  return [...byId.values()];
}

/** Every card with its status derived from the event stream. */
export async function listCards(db: Db): Promise<Card[]> {
  const rows = await db.select().from(cards).orderBy(asc(cards.id));
  const changes = await db
    .select()
    .from(events)
    .where(eq(events.type, "status_changed"))
    .orderBy(asc(events.seq));
  const statusByCard = new Map<string, Status>();
  for (const row of changes) {
    const e = fromRow(row);
    if (e.type === "status_changed") statusByCard.set(e.card_id, e.to);
  }
  return rows.map((row) => cardFromRow(row, statusByCard.get(row.id) ?? INITIAL_STATUS));
}

/** The card log: every event whose subject is one card, oldest first. */
export async function cardLog(db: Db, cardId: string): Promise<CardEvent[]> {
  const rows = await db.select().from(events).where(eq(events.cardId, cardId)).orderBy(asc(events.seq));
  return rows.map((row) => cardEvent.parse(fromRow(row)));
}

/**
 * The board log: every event, whether about a card, a teammate or the team,
 * oldest first. With `limit`, only the latest `limit` events, still oldest
 * first. The app has one board, so the board log is the whole stream.
 */
export async function boardLog(db: Db, options: { limit?: number } = {}): Promise<StreamEvent[]> {
  if (options.limit === undefined) {
    const rows = await db.select().from(events).orderBy(asc(events.seq));
    return rows.map(fromRow);
  }
  const rows = await db.select().from(events).orderBy(desc(events.seq)).limit(options.limit);
  return rows.reverse().map(fromRow);
}

/** The cycle log: every event, of any subject, whose `at` falls in the cycle's window, oldest first. */
export async function cycleLog(db: Db, cycleId: string): Promise<StreamEvent[]> {
  const [c] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!c) throw new StoreError(`no cycle '${cycleId}'`, "not_found");
  const rows = await db
    .select()
    .from(events)
    .where(and(gte(events.atMs, c.startsAtMs), lt(events.atMs, c.endsAtMs)))
    .orderBy(asc(events.seq));
  return rows.map(fromRow);
}

/** Everything a fresh database needs to show a board. */
export interface SeedData {
  /**
   * People join with their roles at `joined_at` and start with no chosen
   * modes; `mode_changed` events in `events` give them their profiles.
   */
  teammates: TeammateRecord[];
  /** When the teammates joined: the time of each person's first `roles_changed` event, before every event in `events`. */
  joined_at: string;
  cycles: Cycle[];
  cards: CardRecord[];
  /** In stream order. */
  events: StreamEvent[];
}

/**
 * Every event `seed` stores, in stream order: each person's joining event,
 * then `data.events`.
 */
export function seedEvents(data: SeedData): StreamEvent[] {
  return [...data.teammates.flatMap((t) => joiningEvent(t, data.joined_at) ?? []), ...data.events];
}

/**
 * Load seed data into an empty database, through the same checks as live
 * writes. Seed data lives in one module (src/seed/invented.ts) so a real
 * project can replace it.
 */
export async function seed(db: Db, data: SeedData, functionIds: ReadonlySet<string>): Promise<void> {
  for (const t of data.teammates) await addTeammate(db, t, data.joined_at);
  for (const c of data.cycles) await addCycle(db, c);
  for (const c of data.cards) await addCard(db, c, functionIds);
  for (const e of data.events) await appendEvent(db, e);
}
