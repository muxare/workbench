// The board's title: the headline the team set, or else the team's name. A
// board whose team was never named falls back to a plain word, so a database
// made before `team_named` existed still renders.
import type { BoardResponse } from "@workbench/shared";

export const UNNAMED_BOARD_TITLE = "Board";

export function boardTitle(board: Pick<BoardResponse, "team">): string {
  return board.team?.headline ?? board.team?.name ?? UNNAMED_BOARD_TITLE;
}

// Deliberate lint error for the card #5 loop test: the first push must fail `pnpm check`. Remove before merge.
export function deliberateLintFailure(): string {
  let unchanged = "never reassigned";
  return unchanged;
}
