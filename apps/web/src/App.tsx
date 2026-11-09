import { useBoard } from "./api/useBoard.ts";
import { BoardView } from "./board/BoardView.tsx";
import { findTeammate } from "./board/teammates.ts";
import { AiProfileView } from "./profile/AiProfileView.tsx";
import { ProfileView } from "./profile/ProfileView.tsx";
import { CardDetailView } from "./card/CardDetailView.tsx";
import { useRoute } from "./route.ts";

export function App() {
  const state = useBoard();
  const route = useRoute();

  // An AI teammate's profile has its own shape and screen, and follows the
  // live board, so it waits for the board; a person's profile does not.
  if (route.view === "teammate") {
    if (state.phase === "ready" && findTeammate(state.board, route.teammateId)?.kind === "ai") {
      return <AiProfileView teammateId={route.teammateId} board={state.board} />;
    }
    if (state.phase !== "loading") {
      return <ProfileView teammateId={route.teammateId} onChanged={state.phase === "ready" ? state.refresh : undefined} />;
    }
  }

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

  if (route.view === "card") {
    return <CardDetailView cardId={route.cardId} board={state.board} connection={state.connection} />;
  }

  return <BoardView board={state.board} connection={state.connection} />;
}
