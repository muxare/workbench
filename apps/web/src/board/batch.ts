// Handing several Ready cards to the AI as one batch, and the batch markers on
// the board (docs/dev-loop.md, stage 3b). Pure functions over the board; the
// `BatchBar` component and the Ready column lay them out and send the request.
//
// The board can check part of what `POST /api/batches` checks: the card is
// Ready, owned by a person, in no open batch, its owner works its function in
// a mode the AI works in from a session, and its dependencies outside the
// batch are done. The API also reads the function file and the card's log
// (allowed modes, protocol, who opened the card); what it refuses on those
// grounds shows on screen as its reason.
import {
  batchCards,
  ownerMode,
  SESSION_MODES,
  unfinishedDependencies,
  type Batch,
  type BoardResponse,
  type Card,
} from "@workbench/shared";
import { modeLabel } from "./modes.ts";
import { aiTeammate, cardRef, findTeammate, labelOf } from "./teammates.ts";

/** The open batch a card is in, if any. A card released from a batch (`batchCards`) is in it no longer. */
export function batchOf(cardId: string, board: BoardResponse): Batch | undefined {
  return board.batches.find((b) => b.state !== "finished" && batchCards(b).includes(cardId));
}

/** The marker on a card in an open batch: "Batch 1 · queued" before the plan, "Batch 1 · wave 2" after. */
export function batchMarker(card: Card, board: BoardResponse): string | undefined {
  const b = batchOf(card.id, board);
  if (!b) return undefined;
  if (b.plan === null) return `Batch ${b.id} · queued`;
  const wave = b.plan.waves.findIndex((w) => w.card_ids.includes(card.id));
  return wave < 0 ? `Batch ${b.id}` : `Batch ${b.id} · wave ${String(wave + 1)}`;
}

/** Whether a Ready card can be ticked for a batch, or why not, in a few words for the tile. */
export type BatchChoice = { selectable: true } | { selectable: false; reason: string };

export function batchChoice(card: Card, board: BoardResponse): BatchChoice {
  const refuse = (reason: string): BatchChoice => ({ selectable: false, reason });
  if (card.status.state !== "ready") return refuse("Not in Ready");
  const holder = batchOf(card.id, board);
  if (holder) return refuse(`Already in batch ${holder.id}`);
  const owner = findTeammate(board, card.owner);
  if (owner?.kind !== "human") return refuse("Not owned by a person");
  const fn = board.functions.find((f) => f.name === card.function_id);
  if (!fn) return refuse(`No function ${card.function_id}`);
  const mode = ownerMode(owner, fn);
  if (!SESSION_MODES.includes(mode)) return refuse(`${labelOf(board, owner.id)} works it as “${modeLabel[mode]}”`);
  return { selectable: true };
}

/** The ids still selectable, in the order they were ticked; a card that moved or was handed meanwhile drops out. */
export function keepSelectable(selected: readonly string[], board: BoardResponse): string[] {
  return selected.filter((id) => {
    const card = board.cards.find((c) => c.id === id);
    return card !== undefined && batchChoice(card, board).selectable;
  });
}

/** Tick or untick one card, keeping the order the cards were ticked in. */
export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/** What the hand-over control offers for the cards ticked so far. */
export type HandOver =
  | { ready: false; hint: string }
  | { ready: true; actor: string; handedTo: string; hint: string };

/**
 * Whether the ticked cards can be handed to the AI, as whom and to whom.
 *
 * There is no sign-in yet, so the person handing over is the cards' owner, as
 * when a person moves or picks a card on its own screen (card #15). When the
 * cards have different owners, it is the owner of the first card ticked, and
 * the hint says so. The AI teammate is the team's first; the API takes the
 * only one when the team has one.
 */
export function handOver(selected: readonly string[], board: BoardResponse): HandOver {
  if (selected.length < 2) {
    return { ready: false, hint: selected.length === 0 ? "Tick two or more Ready cards to hand them to the AI as one batch." : "Tick one more card: a batch has two or more." };
  }
  const ai = aiTeammate(board);
  if (!ai) return { ready: false, hint: "The team has no AI teammate to hand the cards to." };
  const cards = selected.map((id) => board.cards.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);
  const inBatch = new Set(selected);
  for (const c of cards) {
    const outside = unfinishedDependencies(c, board.cards).filter((id) => !inBatch.has(id));
    if (outside.length > 0) {
      return { ready: false, hint: `${cardRef(c.id)} waits on ${outside.map(cardRef).join(", ")}, which is not done and not in the batch.` };
    }
  }
  const first = cards[0]!;
  const actor = first.owner;
  const refs = cards.map((c) => cardRef(c.id)).join(", ");
  const as = labelOf(board, actor);
  const hint = cards.every((c) => c.owner === actor)
    ? `Hands ${refs} to ${labelOf(board, ai.id)} as ${as}, their owner.`
    : `Hands ${refs} to ${labelOf(board, ai.id)} as ${as}, owner of ${cardRef(first.id)}, the first card ticked.`;
  return { ready: true, actor, handedTo: ai.id, hint };
}
