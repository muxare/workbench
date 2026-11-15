// Batches of cards handed to the AI (docs/dev-loop.md, stage 3b). A batch is
// not stored: it is derived from its `batch_handed` and `batch_planned`
// events and the statuses of its cards, like every other view of the stream.
import { z } from "zod";
import {
  batchCardIds,
  batchId,
  batchWave,
  cardId,
  teammateId,
  unfinishedDependencies,
  type BatchWave,
  type Card,
  type StreamEvent,
} from "./domain.ts";

/**
 * Where a batch stands: `handed` until the AI posts a plan, `planned` after,
 * and `finished` once every card in it is in Review or Done. A finished batch
 * is no longer open, so its cards may be handed again.
 */
export const batchState = z.enum(["handed", "planned", "finished"]);
export type BatchState = z.infer<typeof batchState>;

/** The AI's plan for a batch, from its `batch_planned` event. */
export const batchPlan = z.object({
  waves: z.array(batchWave).min(1),
  planned_by: teammateId,
  planned_at: z.iso.datetime({ offset: true }),
});
export type BatchPlan = z.infer<typeof batchPlan>;

/**
 * A batch as derived from the stream: who handed which cards to whom, its
 * plan once posted, and its state. `card_ids` are the cards as handed;
 * `released_card_ids` are those that have left the batch since, because a
 * person moved the card back to Backlog or handed it again in a later batch.
 * A released card no longer counts towards the batch's state or its plan.
 */
export const batch = z.object({
  id: batchId,
  card_ids: batchCardIds,
  released_card_ids: z.array(cardId),
  handed_to: teammateId,
  handed_by: teammateId,
  handed_at: z.iso.datetime({ offset: true }),
  state: batchState,
  plan: batchPlan.nullable(),
});
export type Batch = z.infer<typeof batch>;

/** The cards still in the batch: those handed, less those released, in batch order. */
export function batchCards(b: Batch): string[] {
  const released = new Set(b.released_card_ids);
  return b.card_ids.filter((id) => !released.has(id));
}

/** The states in which a card no longer needs the batch: its work is in review or merged. */
const FINISHED_CARD_STATES = new Set<string>(["review", "done"]);

/**
 * Every batch in the stream, in the order it was handed, with its state
 * derived from `cards`. A card leaves (is released from) a batch when a
 * `status_changed` event moves it to Backlog, or when a later `batch_handed`
 * includes it, so a card is in at most one batch at a time. A batch is
 * finished once every card still in it is in Review or Done, which includes
 * a batch with no cards left, and it stays finished: a card sent back from
 * Review later (changes requested) is worked on its own, and may be handed
 * in a new batch. Card statuses are read from the `status_changed` events in
 * `events` as they come, and from `cards` as they stand now; a card in
 * neither counts as unfinished. A
 * `batch_planned` event about no handed batch is ignored, and only the first
 * plan of a batch counts; the store refuses both. `events` must be in stream
 * order; events of other types are ignored.
 */
export function deriveBatches(events: readonly StreamEvent[], cards: readonly Card[]): Batch[] {
  const byId = new Map<string, Batch>();
  const finished = new Set<string>();
  const status = new Map<string, string>();
  const release = (cardId: string) => {
    for (const b of byId.values()) {
      if (b.card_ids.includes(cardId) && !b.released_card_ids.includes(cardId)) b.released_card_ids.push(cardId);
    }
  };
  const done = (b: Batch) => batchCards(b).every((id) => FINISHED_CARD_STATES.has(status.get(id) ?? ""));
  for (const e of events) {
    if (e.type === "status_changed") status.set(e.card_id, e.to.state);
    if (e.type === "batch_handed" && !byId.has(e.batch_id)) {
      for (const id of e.card_ids) release(id);
      byId.set(e.batch_id, {
        id: e.batch_id,
        card_ids: [...e.card_ids],
        released_card_ids: [],
        handed_to: e.handed_to,
        handed_by: e.actor,
        handed_at: e.at,
        state: "handed",
        plan: null,
      });
    }
    if (e.type === "status_changed" && e.to.state === "backlog") release(e.card_id);
    if (e.type === "batch_planned") {
      const b = byId.get(e.batch_id);
      if (b && b.plan === null) b.plan = { waves: e.waves.map((w) => ({ card_ids: [...w.card_ids], note: w.note })), planned_by: e.actor, planned_at: e.at };
    }
    if (e.type === "status_changed" || e.type === "batch_handed") {
      for (const b of byId.values()) if (!finished.has(b.id) && done(b)) finished.add(b.id);
    }
  }
  // The cards as they stand now decide too, for a caller that passes only the batch events.
  for (const c of cards) status.set(c.id, c.status.state);
  return [...byId.values()].map((b) => {
    const over = finished.has(b.id) || done(b);
    return { ...b, state: over ? "finished" : b.plan === null ? "handed" : "planned" };
  });
}

/**
 * The ids of the cards `card` depends on that do not let it be picked yet:
 * those not done (`unfinishedDependencies`), less those met by a plan. A
 * dependency is met by a plan when `card` and the dependency are both still
 * in an open, planned batch in `batches` and the dependency is in an earlier
 * wave than `card`: its branch is worked first and `card`'s branch is stacked
 * on it, so the pull requests still merge in order and a person approves
 * each. A dependency in the same or a later wave, or outside the batch, must
 * be done. Pass only the batches handed to the teammate picking; with none,
 * this is `unfinishedDependencies`.
 */
export function unmetDependencies(card: Card, cards: readonly Card[], batches: readonly Batch[] = []): string[] {
  const met = new Set<string>();
  for (const b of openBatches(batches)) {
    if (b.plan === null) continue;
    const inBatch = new Set(batchCards(b));
    if (!inBatch.has(card.id)) continue;
    const wave = b.plan.waves.findIndex((w) => w.card_ids.includes(card.id));
    for (const earlier of b.plan.waves.slice(0, Math.max(wave, 0))) {
      for (const id of earlier.card_ids) if (inBatch.has(id)) met.add(id);
    }
  }
  return unfinishedDependencies(card, cards).filter((id) => !met.has(id));
}

/** The batches not yet finished, in the order given. */
export function openBatches(batches: readonly Batch[]): Batch[] {
  return batches.filter((b) => b.state !== "finished");
}

/**
 * The id the next batch takes: one more than the highest batch id in the
 * stream that is a plain number, or "1" when there is none, as for cards.
 */
export function nextBatchId(events: readonly StreamEvent[]): string {
  let highest = 0;
  for (const e of events) {
    if (e.type === "batch_handed" && /^[1-9][0-9]*$/.test(e.batch_id)) highest = Math.max(highest, Number(e.batch_id));
  }
  return String(highest + 1);
}

/**
 * Whether `waves` is a valid plan for a batch of `cardIds`: every card of the
 * batch is in exactly one wave and no other card is in any, and a card is in a
 * strictly later wave than every card of the batch it `depends_on`. Links to
 * cards outside the batch are not the plan's business. `cards` supplies the
 * links; a batch card not in `cards` has none. The first problem found is the
 * reason.
 */
export function checkPlan(
  cardIds: readonly string[],
  waves: readonly BatchWave[],
  cards: readonly Card[],
): { ok: true } | { ok: false; reason: string } {
  const refuse = (reason: string) => ({ ok: false as const, reason });
  const inBatch = new Set(cardIds);
  const waveOf = new Map<string, number>();
  for (const [i, wave] of waves.entries()) {
    for (const id of wave.card_ids) {
      if (!inBatch.has(id)) return refuse(`${id} is not in the batch`);
      if (waveOf.has(id)) return refuse(`${id} is in the plan twice`);
      waveOf.set(id, i);
    }
  }
  const missing = cardIds.filter((id) => !waveOf.has(id));
  if (missing.length > 0) return refuse(`the plan leaves out ${missing.join(", ")}`);
  for (const id of cardIds) {
    const card = cards.find((c) => c.id === id);
    const wave = waveOf.get(id) ?? 0;
    for (const link of card?.links ?? []) {
      const dependency = waveOf.get(link.card_id);
      if (dependency !== undefined && dependency >= wave) {
        return refuse(`${id} depends on ${link.card_id}, so it goes in a later wave than ${link.card_id}`);
      }
    }
  }
  return { ok: true };
}
