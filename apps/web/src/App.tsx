import { useBoard } from "./api/useBoard.ts";
import { BoardView } from "./board/BoardView.tsx";

export function App() {
  const state = useBoard();

  if (state.phase === "loading") {
    return (
      <main className="page page--centered">
        <p className="state-message" role="status">
          Loading the board…
        </p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="page page--centered">
        <div className="state-message state-message--error" role="alert">
          <b>The board could not be loaded.</b>
          <span>{state.reason}</span>
          <button type="button" className="button" onClick={state.retry}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return <BoardView board={state.board} connection={state.connection} />;
}
