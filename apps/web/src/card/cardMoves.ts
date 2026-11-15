// What a person may do with a card from its header before work starts: open a
// Backlog card by moving it to Ready, send a Ready card back to Backlog, or
// pick a Ready card themselves in a mode they choose. Pure functions; the
// `CardMoves` component lays them out and sends the requests.
//
// Choosing a mode is choosing the owner's mode for the card's function: the
// pick changes the owner's process profile first (a `mode_changed` event, as
// on the profile screen) and then picks, so a card is still always worked in
// its owner's mode. Decided by Mikael on card #15, 2026-11-15.
import { ownerMode, unfinishedDependencies, type BoardResponse, type CardResponse, type Mode } from "@workbench/shared";
import { modeMeaning } from "../board/modes.ts";
import { cardRef, findTeammate } from "../board/teammates.ts";

/** The header's moves for one card, or why there are none. */
export type CardMovesView =
  | { kind: "none" }
  | { kind: "open"; actor: string }
  | {
      kind: "pick";
      actor: string;
      functionId: string;
      /** The modes the function allows, in its file's order. */
      allowed: readonly Mode[];
      /** The owner's mode for the function now: their choice or the function's default. */
      current: Mode;
      /** Why the card cannot be picked yet, when it cannot. Moving it back to Backlog still works. */
      blocked: string | undefined;
    };

/**
 * Which moves the header offers. There is no sign-in yet, so the person who
 * moves and picks is the card's owner, as when answering a question; a card
 * owned by an AI teammate offers no moves, because only a person opens a card
 * and the API refuses to pick a card whose owner has no process profile.
 */
export function cardMoves(detail: CardResponse, board: BoardResponse): CardMovesView {
  const { card, function: fn } = detail;
  const owner = findTeammate(board, card.owner);
  if (owner?.kind !== "human") return { kind: "none" };
  if (card.status.state === "backlog") return { kind: "open", actor: owner.id };
  if (card.status.state !== "ready" || !fn) return { kind: "none" };
  const blockers = unfinishedDependencies(card, board.cards);
  return {
    kind: "pick",
    actor: owner.id,
    functionId: fn.name,
    allowed: fn.modes.allowed,
    current: ownerMode(owner, fn),
    blocked: blockers.length > 0 ? `Waits on ${blockers.map(cardRef).join(", ")}, which is not done.` : undefined,
  };
}

/** The requests a pick sends, in order: a mode change only when the choice differs from the owner's mode. */
export function pickSteps(view: Extract<CardMovesView, { kind: "pick" }>, chosen: Mode): ("set_mode" | "pick")[] {
  return chosen === view.current ? ["pick"] : ["set_mode", "pick"];
}

/** What the mode choice says it will do, under the control. */
export function pickHint(view: Extract<CardMovesView, { kind: "pick" }>, chosen: Mode): string {
  return chosen === view.current
    ? `Picks the card in your mode for ${view.functionId}: “${modeMeaning[chosen]}”.`
    : `Sets your mode for ${view.functionId} to “${modeMeaning[chosen]}”, then picks the card.`;
}
