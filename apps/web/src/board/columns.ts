import { cardStatus, type Card, type CardStatus } from "@workbench/shared";

// Board column headings, as the Main artboard writes them (docs/design/concept/Main.dc.html).
const labels: Record<CardStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In progress",
  needs_input: "Needs input",
  review: "Review",
  done: "Done",
};

export function columnLabel(status: CardStatus): string {
  return labels[status];
}

export interface Column {
  status: CardStatus;
  label: string;
  cards: Card[];
}

/**
 * One column per shared status, in the order the schema lists them, which is
 * the artboard's left-to-right order. Every column is present even when empty,
 * and cards keep the order the API sent them in.
 */
export function groupIntoColumns(cards: readonly Card[]): Column[] {
  return cardStatus.options.map((status) => ({
    status,
    label: columnLabel(status),
    cards: cards.filter((c) => c.status.state === status),
  }));
}
