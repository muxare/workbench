// Which teammate is linked to which card, and how. The artboard's three line
// styles: solid = works on a card, dashed = needs input, dotted = reports back.
import { isCardEvent, type BoardResponse, type Card, type CardStatus, type Mode } from "@workbench/shared";
import { aiTeammate, cardRef, externalLabel, findTeammate, labelOf } from "./teammates.ts";

/** Statuses in which someone is working on a card. */
export const activeStatuses: readonly CardStatus[] = ["in_progress", "needs_input", "review"];

export function isActive(card: Card): boolean {
  return activeStatuses.includes(card.status.state);
}

/**
 * The mode a card is worked in: the mode of its latest `picked` event in the
 * log, or else the mode its owner set for the card's function. Undefined when
 * neither is known (the function's default lives in process/, which the board
 * response does not carry).
 */
export function cardMode(card: Card, board: BoardResponse): Mode | undefined {
  for (let i = board.log.length - 1; i >= 0; i -= 1) {
    const e = board.log[i]!;
    if (e.type === "picked" && e.card_id === card.id) return e.mode;
  }
  const owner = findTeammate(board, card.owner);
  return owner?.kind === "human" ? owner.process_profile[card.function_id] : undefined;
}

/** Who picked the card last, from the log. */
export function cardPicker(card: Card, board: BoardResponse): string | undefined {
  for (let i = board.log.length - 1; i >= 0; i -= 1) {
    const e = board.log[i]!;
    if (e.type === "picked" && e.card_id === card.id) return e.actor;
  }
  return undefined;
}

/**
 * Everyone on a card, as the artboard orders the avatars: in `delegate` the AI
 * first (it does the work) and the owner second (they verify); otherwise the
 * owner first. The AI is on the card in `assist` and `delegate`, and whoever
 * picked the card is on it too.
 */
export function cardParticipants(card: Card, board: BoardResponse): string[] {
  const m = cardMode(card, board);
  const picker = cardPicker(card, board);
  const ai = picker && findTeammate(board, picker)?.kind === "ai" ? picker : aiTeammate(board)?.id;
  const withAi = m === "assist" || m === "delegate";
  const ids = m === "delegate" && ai ? [ai, card.owner] : [card.owner];
  if (picker) ids.push(picker);
  if (withAi && ai) ids.push(ai);
  return [...new Set(ids)];
}

export type LinkKind = "works" | "asks" | "reports";

/**
 * One line touching a teammate's panel. `arrow` says which end has the
 * arrowhead: at the board (works on, reports back), at this teammate (a
 * question asked of them), or none (a question this teammate asked; the
 * arrowhead is on the other person's side).
 */
export interface Link {
  kind: LinkKind;
  arrow: "board" | "teammate" | "none";
  cardIds: string[];
  label: string;
}

const MAX_REPORTS = 2;

export function linksFor(teammateId: string, board: BoardResponse): Link[] {
  const links: Link[] = [];

  const working = board.cards.filter((c) => isActive(c) && cardParticipants(c, board).includes(teammateId));
  if (working.length > 0) {
    links.push({
      kind: "works",
      arrow: "board",
      cardIds: working.map((c) => c.id),
      label: `works on ${working.map((c) => cardRef(c.id)).join(" · ")}`,
    });
  }

  for (const q of board.open_questions) {
    if (q.answer !== undefined) continue;
    if (q.asked_of === teammateId) {
      links.push({
        kind: "asks",
        arrow: "teammate",
        cardIds: [q.card_id],
        label: q.external
          ? `${labelOf(board, q.asked_by)} asks on ${cardRef(q.card_id)}, to relay to ${externalLabel(q.external)}`
          : `${labelOf(board, q.asked_by)} asks on ${cardRef(q.card_id)}`,
      });
    }
    if (q.asked_by === teammateId) {
      links.push({
        kind: "asks",
        arrow: "none",
        cardIds: [q.card_id],
        label: q.external
          ? `asks ${externalLabel(q.external)} through ${labelOf(board, q.asked_of)} on ${cardRef(q.card_id)}: ${q.text}`
          : `asks ${labelOf(board, q.asked_of)} on ${cardRef(q.card_id)}: ${q.text}`,
      });
    }
  }

  const reported = new Set<string>();
  for (let i = board.log.length - 1; i >= 0 && reported.size < MAX_REPORTS; i -= 1) {
    const e = board.log[i]!;
    if (e.actor !== teammateId || !isCardEvent(e) || reported.has(e.card_id)) continue;
    if (e.type === "report_posted") {
      const done = board.cards.find((c) => c.id === e.card_id)?.status.state === "done";
      reported.add(e.card_id);
      links.push({
        kind: "reports",
        arrow: "board",
        cardIds: [e.card_id],
        label: done ? `reported ${cardRef(e.card_id)} done` : `reported on ${cardRef(e.card_id)}`,
      });
    } else if (e.type === "answered") {
      reported.add(e.card_id);
      links.push({ kind: "reports", arrow: "board", cardIds: [e.card_id], label: `answered ${cardRef(e.card_id)}` });
    }
  }

  return links;
}
