// The event store: append-only card events plus the teammates, cycles and
// cards they refer to. The card, board and cycle logs are three queries over
// the one `events` table (docs/architecture.md, "Logs are views of one event
// stream"); no log is stored on its own. A card's status is derived from its
// `status_changed` events in the same way.
import { and, asc, desc, eq, gt, gte, lt } from "drizzle-orm";
import {
  card as cardSchema,
  cardEvent,
  cycle as cycleSchema,
  teammate as teammateSchema,
  type Card,
  type CardEvent,
  type Cycle,
  type Mode,
  type Question,
  type Status,
  type Teammate,
} from "@workbench/shared";
import type { Db } from "./db/client.ts";
import { cards, cycles, events, teammates, type EventPayload } from "./db/schema.ts";

/** A card as stored: everything but its status, which comes from events. */
export const cardRecord = cardSchema.omit({ status: true });
export type CardRecord = Omit<Card, "status">;

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

function toRow(event: CardEvent): EventInsert {
  const { id, card_id, actor, at, type, ...payload } = event;
  return { id, cardId: card_id, actor, at, type, atMs: Date.parse(at), payload: payload as EventPayload };
}

function fromRow(row: EventRow): CardEvent {
  return cardEvent.parse({ ...row.payload, id: row.id, card_id: row.cardId, actor: row.actor, at: row.at, type: row.type });
}

function teammateFromRow(row: typeof teammates.$inferSelect): Teammate {
  return teammateSchema.parse(
    row.kind === "human"
      ? { kind: row.kind, id: row.id, name: row.name, role: row.role, process_profile: row.processProfile }
      : { kind: row.kind, id: row.id, name: row.name },
  );
}

/**
 * Check an event against the stream so far: it must parse, its `from` must be
 * the card's current state, and an answer must come from a human, because in
 * every protocol `decides` is human.
 */
async function checkEvent(db: Db, input: CardEvent, pending: Map<string, Status>): Promise<CardEvent> {
  const event = cardEvent.parse(input);
  if (event.type === "status_changed") {
    const current = pending.get(event.card_id) ?? (await cardStatus(db, event.card_id));
    if (current.state !== event.from) {
      throw new StoreError(`${event.id}: card ${event.card_id} is ${current.state}, not ${event.from}`, "conflict");
    }
    pending.set(event.card_id, event.to);
  }
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
  event: CardEvent;
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
export function appendEvents(db: Db, inputs: readonly CardEvent[]): Promise<StoredEvent[]> {
  return serialized(db, async () => {
    if (inputs.length === 0) return [];
    const pending = new Map<string, Status>();
    const checked: CardEvent[] = [];
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
export async function appendEvent(db: Db, input: CardEvent): Promise<void> {
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

export async function addTeammate(db: Db, input: Teammate): Promise<void> {
  const t = teammateSchema.parse(input);
  await db.insert(teammates).values({
    id: t.id,
    kind: t.kind,
    name: t.name,
    role: t.kind === "human" ? t.role : null,
    processProfile: t.kind === "human" ? t.process_profile : null,
  });
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
  await db.insert(cards).values({
    id: c.id,
    title: c.title,
    functionId: c.function_id,
    owner: c.owner,
    milestone: c.milestone ?? null,
    links: c.links,
  });
}

export async function getTeammate(db: Db, teammateId: string): Promise<Teammate | undefined> {
  const [row] = await db.select().from(teammates).where(eq(teammates.id, teammateId));
  return row && teammateFromRow(row);
}

/**
 * Set the mode a person works one function in, and return them as they now
 * stand. The profile is the person's current setting, not a log, so it is
 * updated in place; the event stream holds card events only. Whether the mode
 * is allowed for the function is the caller's check, against process/.
 */
export async function setProcessProfileMode(db: Db, teammateId: string, functionId: string, mode: Mode): Promise<Teammate> {
  const current = await getTeammate(db, teammateId);
  if (!current) throw new StoreError(`no teammate '${teammateId}'`, "not_found");
  if (current.kind !== "human") throw new StoreError(`${teammateId} is not a person and has no process profile`);
  const profile = { ...current.process_profile, [functionId]: mode };
  await db.update(teammates).set({ processProfile: profile }).where(eq(teammates.id, teammateId));
  return { ...current, process_profile: profile };
}

export async function listTeammates(db: Db): Promise<Teammate[]> {
  const rows = await db.select().from(teammates).orderBy(asc(teammates.id));
  return rows.map(teammateFromRow);
}

export async function getCycle(db: Db, cycleId: string): Promise<Cycle | undefined> {
  const [row] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  return row && cycleSchema.parse({ id: row.id, name: row.name, starts_at: row.startsAt, ends_at: row.endsAt });
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

/** The card log: every event on one card, oldest first. */
export async function cardLog(db: Db, cardId: string): Promise<CardEvent[]> {
  const rows = await db.select().from(events).where(eq(events.cardId, cardId)).orderBy(asc(events.seq));
  return rows.map(fromRow);
}

/**
 * The board log: every event on every card, oldest first. With `limit`, only
 * the latest `limit` events, still oldest first. The app has one board, so the
 * board log is the whole stream.
 */
export async function boardLog(db: Db, options: { limit?: number } = {}): Promise<CardEvent[]> {
  if (options.limit === undefined) {
    const rows = await db.select().from(events).orderBy(asc(events.seq));
    return rows.map(fromRow);
  }
  const rows = await db.select().from(events).orderBy(desc(events.seq)).limit(options.limit);
  return rows.reverse().map(fromRow);
}

/** The cycle log: every event whose `at` falls in the cycle's window, oldest first. */
export async function cycleLog(db: Db, cycleId: string): Promise<CardEvent[]> {
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
  teammates: Teammate[];
  cycles: Cycle[];
  cards: CardRecord[];
  /** In stream order. */
  events: CardEvent[];
}

/**
 * Load seed data into an empty database, through the same checks as live
 * writes. Seed data lives in one module (src/seed/invented.ts) so a real
 * project can replace it.
 */
export async function seed(db: Db, data: SeedData, functionIds: ReadonlySet<string>): Promise<void> {
  for (const t of data.teammates) await addTeammate(db, t);
  for (const c of data.cycles) await addCycle(db, c);
  for (const c of data.cards) await addCard(db, c, functionIds);
  for (const e of data.events) await appendEvent(db, e);
}
