import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import type { BoardConnection } from "../api/useBoard.ts";
import { BatchBar } from "./BatchBar.tsx";
import { keepSelectable, toggleSelected } from "./batch.ts";
import { BoardColumn, type BatchSelection, type NewCardToggle } from "./BoardColumn.tsx";
import { milestoneProgress } from "./cardView.ts";
import { groupIntoColumns } from "./columns.ts";
import { ConnectionIndicator } from "./ConnectionIndicator.tsx";
import { CycleLog } from "./CycleLog.tsx";
import { NewCard } from "./NewCard.tsx";

/**
 * The board panel: header with the current cycle and milestone progress, six
 * columns, the cycle log. "Select" on the Ready column starts selecting cards
 * for a batch; the batch bar then sits between the header and the columns.
 * "New card" on the Backlog column opens the new card form in the same place.
 */
export function Board({
  board,
  connection,
  onFilterChanged,
  onBatchHanded,
  onCardCreated,
}: {
  board: BoardResponse;
  connection: BoardConnection;
  onFilterChanged?: (() => void) | undefined;
  onBatchHanded?: (() => void) | undefined;
  onCardCreated?: (() => void) | undefined;
}) {
  const progress = milestoneProgress(board.cards);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Each new board drops the selected cards that left Ready or joined a batch,
  // so a card that leaves and comes back is not selected again on its own.
  const [seenBoard, setSeenBoard] = useState(board);
  if (seenBoard !== board) {
    setSeenBoard(board);
    setSelected(keepSelectable(selected, board));
  }
  const stop = () => {
    setSelecting(false);
    setSelected([]);
  };
  const selection: BatchSelection = {
    selecting,
    selected,
    onToggleSelecting: () => (selecting ? stop() : setSelecting(true)),
    onToggle: (id) => setSelected(toggleSelected(selected, id)),
  };
  const [creating, setCreating] = useState(false);
  const newCard: NewCardToggle = { open: creating, onToggle: () => setCreating(!creating) };

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
      {creating && <NewCard board={board} onClose={() => setCreating(false)} onCreated={onCardCreated} />}
      {selecting && <BatchBar board={board} selected={selected} onDone={stop} onHanded={onBatchHanded} />}
      <div className="board__columns">
        {groupIntoColumns(board.cards).map((col) => (
          <BoardColumn key={col.status} board={board} column={col} selection={selection} newCard={newCard} />
        ))}
      </div>
      <CycleLog board={board} onFilterChanged={onFilterChanged} />
    </section>
  );
}
