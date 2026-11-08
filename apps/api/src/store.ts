// The event store: append-only card events plus the teammates, cycles and
// cards they refer to. The card, board and cycle logs are three queries over
// the one `events` table (docs/architecture.md, "Logs are views of one event
// stream"); no log is stored on its own. A card's status is derived from its
// `status_changed` events in the same way.
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import {
  card as cardSchema,
  cardEvent,
  cycle as cycleSchema,
  teammate as teammateSchema,
  type Card,
  type CardEvent,
  type Cycle,
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

export class StoreError extends Error {
  override name = "StoreError";
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
      ? { kind: row.kind, id: row.id, name: row.name, process_profile: row.processProfile }
      : { kind: row.kind, id: row.id, name: row.name },
  );
}

/**
 * Check an event against the stream so far: it must parse, its `from` must be
 * the card's current state, and an answer must come from a human, because in
 * every protocol `decides` is human.
 */
async function checkEvent(db: Db, input: CardEvent): Promise<CardEvent> {
  const event = cardEvent.parse(input);
  if (event.type === "status_changed") {
    const current = await cardStatus(db, event.card_id);
    if (current.state !== event.from) {
      throw new StoreError(`${event.id}: card ${event.card_id} is ${current.state}, not ${event.from}`);
    }
  }
  if (event.type === "answered") {
    const [actor] = await db.select().from(teammates).where(eq(teammates.id, event.actor));
    if (actor?.kind !== "human") {
      throw new StoreError(`${event.id}: answers are decided by a human, not ${event.actor}`);
    }
  }
  return event;
}

/** Append one event to the stream. Events are never updated or deleted. */
export async function appendEvent(db: Db, input: CardEvent): Promise<void> {
  const event = await checkEvent(db, input);
  await db.insert(events).values(toRow(event));
}

export async function addTeammate(db: Db, input: Teammate): Promise<void> {
  const t = teammateSchema.parse(input);
  await db.insert(teammates).values({
    id: t.id,
    kind: t.kind,
    name: t.name,
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
    throw new StoreError(`${c.id}: no function '${c.function_id}' in process/functions`);
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
  return rows.map((row) =>
    cardSchema.parse({
      id: row.id,
      title: row.title,
      function_id: row.functionId,
      owner: row.owner,
      status: statusByCard.get(row.id) ?? INITIAL_STATUS,
      ...(row.milestone === null ? {} : { milestone: row.milestone }),
      links: row.links,
    }),
  );
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
  if (!c) throw new StoreError(`no cycle '${cycleId}'`);
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
