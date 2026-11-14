import type { BoardResponse, Teammate } from "@workbench/shared";
import type { BoardConnection } from "../api/useBoard.ts";
import { Board } from "./Board.tsx";
import { Connector, type Side } from "./Connector.tsx";
import { Legend } from "./Legend.tsx";
import { linksFor } from "./links.ts";
import { TeammatePanel } from "./TeammatePanel.tsx";
import { placeTeammates } from "./teammates.ts";
import { boardTitle } from "./title.ts";

function Group({ board, side, teammates }: { board: BoardResponse; side: Side; teammates: Teammate[] }) {
  return (
    <div className={`group group--${side}`}>
      {teammates.map((t) => (
        <div key={t.id} className={`seat seat--${side}`}>
          <TeammatePanel board={board} teammate={t} />
          <Connector links={linksFor(t.id, board)} side={side} />
        </div>
      ))}
    </div>
  );
}

/** The Main artboard: page header, the board in the centre, teammates around it. */
export function BoardView({
  board,
  connection,
  onFilterChanged,
}: {
  board: BoardResponse;
  connection: BoardConnection;
  onFilterChanged?: (() => void) | undefined;
}) {
  const seats = placeTeammates(board.teammates);
  return (
    <main className="page">
      <header className="page__head">
        <div className="page__intro">
          <h1>{boardTitle(board)}</h1>
          <p>
            Everyone, AI included, picks work from the same board. Each person's process map sets how they work with AI.
            Results, questions and status changes land on the card and in the cycle log.
          </p>
        </div>
        <Legend />
      </header>
      <div className="stage">
        <Group board={board} side="top" teammates={seats.top} />
        <Group board={board} side="left" teammates={seats.left} />
        <div className="stage__board">
          <Board board={board} connection={connection} onFilterChanged={onFilterChanged} />
        </div>
        <Group board={board} side="right" teammates={seats.right} />
        <Group board={board} side="bottom" teammates={seats.bottom} />
      </div>
    </main>
  );
}
