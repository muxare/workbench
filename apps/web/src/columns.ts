import type { CardStatus } from "@workbench/shared";

// Board column headings. The board UI task replaces this with the Main artboard's labels.
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
