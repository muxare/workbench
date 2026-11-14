// The board's title: the headline the team set, or else the team's name. A
// board whose team was never named falls back to a plain word, so a database
// made before `team_named` existed still renders.
import type { BoardResponse } from "@workbench/shared";

export const UNNAMED_BOARD_TITLE = "Board";

export function boardTitle(board: Pick<BoardResponse, "team">): string {
  return board.team?.headline ?? board.team?.name ?? UNNAMED_BOARD_TITLE;
}
