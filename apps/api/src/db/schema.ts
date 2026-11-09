// SQLite tables for the event store. Rows are validated against the zod
// schemas in @workbench/shared on the way in and out; the types here only say
// how each value is stored.
//
// Cards hold what does not change through the lifecycle (title, function,
// owner, milestone, links). A card's status is not stored: it is derived from
// its `status_changed` events, so the event stream stays the one record of
// what happened. A person's process profile is not stored either: it is
// derived from their `mode_changed` events. The card, board and cycle logs are
// queries over `events`.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CardLink, StreamEventType, Teammate, TeammateRole } from "@workbench/shared";

export const teammates = sqliteTable("teammates", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<Teammate["kind"]>().notNull(),
  name: text("name").notNull(),
  /** Set for humans only: po, ux, fe or be. */
  role: text("role").$type<TeammateRole>(),
});

export const cycles = sqliteTable("cycles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  /** Epoch milliseconds of starts_at and ends_at, so windows compare across time zone offsets. */
  startsAtMs: integer("starts_at_ms").notNull(),
  endsAtMs: integer("ends_at_ms").notNull(),
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  /** A function `name` from process/functions/; checked against process/ when written. */
  functionId: text("function_id").notNull(),
  owner: text("owner")
    .notNull()
    .references(() => teammates.id),
  milestone: text("milestone"),
  links: text("links", { mode: "json" }).$type<CardLink[]>().notNull(),
});

/**
 * The fields of an event beyond the ones with their own column. Stored as
 * JSON and parsed back through the shared `streamEvent` schema when read.
 */
export type EventPayload = Record<string, unknown>;

export const events = sqliteTable(
  "events",
  {
    /** Position in the stream. Logs are ordered by it. */
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().unique(),
    /**
     * The event's subject. A card event sets `card_id`, a teammate event sets
     * `teammate_id`, and an event about the whole team would set neither.
     */
    cardId: text("card_id").references(() => cards.id),
    teammateId: text("teammate_id").references(() => teammates.id),
    type: text("type").$type<StreamEventType>().notNull(),
    actor: text("actor")
      .notNull()
      .references(() => teammates.id),
    at: text("at").notNull(),
    /** Epoch milliseconds of `at`, for cycle windows. */
    atMs: integer("at_ms").notNull(),
    payload: text("payload", { mode: "json" }).$type<EventPayload>().notNull(),
  },
  (t) => [
    index("events_card_seq").on(t.cardId, t.seq),
    index("events_teammate_seq").on(t.teammateId, t.seq),
    index("events_at_ms").on(t.atMs),
  ],
);
