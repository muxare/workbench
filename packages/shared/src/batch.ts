// Batches of cards handed to the AI (docs/dev-loop.md, stage 3b). A batch is
// not stored: it is derived from its `batch_handed` and `batch_planned`
// events and the statuses of its cards, like every other view of the stream.
import { z } from "zod";
import {
  batchCardIds,
  batchId,
  batchWave,
  teammateId,
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

/** A batch as derived from the stream: who handed which cards to whom, its plan once posted, and its state. */
export const batch = z.object({
  id: batchId,
  card_ids: batchCardIds,
  handed_to: teammateId,
  handed_by: teammateId,
  handed_at: z.iso.datetime({ offset: true }),
  state: batchState,
  plan: batchPlan.nullable(),
});
export type Batch = z.infer<typeof batch>;

/** The states in which a card no longer needs the batch: its work is in review or merged. */
const FINISHED_CARD_STATES = new Set<string>(["review", "done"]);

/**
 * Every batch in the stream, in the order it was handed, with its state
 * derived from `cards`. A card not in `cards` counts as unfinished. A
 * `batch_planned` event about no handed batch is ignored, and only the first
 * plan of a batch counts; the store refuses both. `events` must be in stream
 * order; events of other types are ignored.
 */
export function deriveBatches(events: readonly StreamEvent[], cards: readonly Card[]): Batch[] {
  const byId = new Map<string, Batch>();
  for (const e of events) {
    if (e.type === "batch_handed" && !byId.has(e.batch_id)) {
      byId.set(e.batch_id, {
        id: e.batch_id,
        card_ids: [...e.card_ids],
        handed_to: e.handed_to,
        handed_by: e.actor,
        handed_at: e.at,
        state: "handed",
        plan: null,
      });
    }
    if (e.type === "batch_planned") {
      const b = byId.get(e.batch_id);
      if (b && b.plan === null) b.plan = { waves: e.waves.map((w) => ({ card_ids: [...w.card_ids], note: w.note })), planned_by: e.actor, planned_at: e.at };
    }
  }
  const status = new Map(cards.map((c) => [c.id, c.status.state]));
  return [...byId.values()].map((b) => {
    const finished = b.card_ids.every((id) => FINISHED_CARD_STATES.has(status.get(id) ?? ""));
    return { ...b, state: finished ? "finished" : b.plan === null ? "handed" : "planned" };
  });
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
