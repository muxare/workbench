import type { BoardResponse } from "@workbench/shared";
import type { BoardConnection } from "../api/useBoard.ts";
import { BoardColumn } from "./BoardColumn.tsx";
import { milestoneProgress } from "./cardView.ts";
import { groupIntoColumns } from "./columns.ts";
import { ConnectionIndicator } from "./ConnectionIndicator.tsx";
import { CycleLog } from "./CycleLog.tsx";

/** The board panel: header with milestone progress, six columns, the cycle log. */
export function Board({
  board,
  connection,
  onFilterChanged,
}: {
  board: BoardResponse;
  connection: BoardConnection;
  onFilterChanged?: (() => void) | undefined;
}) {
  const progress = milestoneProgress(board.cards);
  return (
    <section className="board" aria-label="Team board">
      <header className="board__head">
        <h2 className="board__title">Team board</h2>
        <div className="board__status">
          {progress && (
            <span className="milestone">
              Toward <b>{progress.name}</b>
              <span className="milestone__bar" aria-hidden="true">
                <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              <span className="mono">
                {progress.done} of {progress.total}
              </span>
            </span>
          )}
          <ConnectionIndicator connection={connection} />
        </div>
      </header>
      <div className="board__columns">
        {groupIntoColumns(board.cards).map((col) => (
          <BoardColumn key={col.status} board={board} column={col} />
        ))}
      </div>
      <CycleLog board={board} onFilterChanged={onFilterChanged} />
    </section>
  );
}
