import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import type { BoardConnection } from "../api/useBoard.ts";
import { BatchBar } from "./BatchBar.tsx";
import { keepSelectable, toggleSelected } from "./batch.ts";
import { BoardColumn, type BatchSelection } from "./BoardColumn.tsx";
import { milestoneProgress } from "./cardView.ts";
import { groupIntoColumns } from "./columns.ts";
import { ConnectionIndicator } from "./ConnectionIndicator.tsx";
import { CycleLog } from "./CycleLog.tsx";

/**
 * The board panel: header with the current cycle and milestone progress, six
 * columns, the cycle log. "Select" on the Ready column starts ticking cards
 * for a batch; the batch bar then sits between the header and the columns.
 */
export function Board({
  board,
  connection,
  onFilterChanged,
  onBatchHanded,
}: {
  board: BoardResponse;
  connection: BoardConnection;
  onFilterChanged?: (() => void) | undefined;
  onBatchHanded?: (() => void) | undefined;
}) {
  const progress = milestoneProgress(board.cards);
  const [selecting, setSelecting] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  // A card that left Ready or joined a batch since it was ticked drops out.
  const selected = keepSelectable(ticked, board);
  const stop = () => {
    setSelecting(false);
    setTicked([]);
  };
  const selection: BatchSelection = {
    selecting,
    selected,
    onToggleSelecting: () => (selecting ? stop() : setSelecting(true)),
    onToggle: (id) => setTicked(toggleSelected(selected, id)),
  };

  return (
    <section className="board" aria-label="Team board">
      <header className="board__head">
        <h2 className="board__title">
          Team board{board.cycle && <span className="board__cycle"> · {board.cycle.cycle.name}</span>}
        </h2>
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
      {selecting && <BatchBar board={board} selected={selected} onDone={stop} onHanded={onBatchHanded} />}
      <div className="board__columns">
        {groupIntoColumns(board.cards).map((col) => (
          <BoardColumn key={col.status} board={board} column={col} selection={selection} />
        ))}
      </div>
      <CycleLog board={board} onFilterChanged={onFilterChanged} />
    </section>
  );
}
