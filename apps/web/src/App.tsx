import { useBoard, type BoardState } from "./api/useBoard.ts";
import { BoardView } from "./board/BoardView.tsx";
import { AiProfileView } from "./profile/AiProfileView.tsx";
import { ProfileView } from "./profile/ProfileView.tsx";
import { kindOnBoard, teammateScreen, useTeammateKind } from "./profile/teammateScreen.ts";
import { CardDetailView } from "./card/CardDetailView.tsx";
import { useRoute } from "./route.ts";

function BoardLoading() {
  return (
    <main className="page page--centered">
      <p className="state-message" role="status">
        Loading the board…
      </p>
    </main>
  );
}

function BoardError({ reason, retry }: { reason: string; retry: () => void }) {
  return (
    <main className="page page--centered">
      <div className="state-message state-message--error" role="alert">
        <b>The board could not be loaded.</b>
        <span>{reason}</span>
        <button type="button" className="button" onClick={retry}>
          Try again
        </button>
      </div>
    </main>
  );
}

/**
 * `#/teammates/<id>`: a person's profile, which does not wait for the board,
 * or an AI teammate's, which follows the live board (see teammateScreen.ts).
 */
function TeammateRoute({ teammateId, state }: { teammateId: string; state: BoardState }) {
  const board = state.phase === "ready" ? state.board : undefined;
  const kind = useTeammateKind(teammateId, kindOnBoard(board, teammateId));
  switch (teammateScreen(state.phase, kind)) {
    case "human":
      return <ProfileView teammateId={teammateId} onChanged={state.phase === "ready" ? state.refresh : undefined} />;
    case "ai":
      return board ? <AiProfileView teammateId={teammateId} board={board} /> : <BoardLoading />;
    case "board-error":
      return state.phase === "error" ? <BoardError reason={state.reason} retry={state.retry} /> : <BoardLoading />;
    case "wait":
      return (
        <main className="page page--centered">
          <p className="state-message" role="status">
            Loading the profile…
          </p>
        </main>
      );
  }
}

export function App() {
  const state = useBoard();
  const route = useRoute();

  if (route.view === "teammate") return <TeammateRoute teammateId={route.teammateId} state={state} />;
  if (state.phase === "loading") return <BoardLoading />;
  if (state.phase === "error") return <BoardError reason={state.reason} retry={state.retry} />;
  if (route.view === "card") {
    return <CardDetailView cardId={route.cardId} board={state.board} connection={state.connection} />;
  }
  return <BoardView board={state.board} connection={state.connection} />;
}
