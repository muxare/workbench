import { useBoard } from "./api/useBoard.ts";
import { BoardView } from "./board/BoardView.tsx";
import { ProfileView } from "./profile/ProfileView.tsx";
import { profileLiveKey } from "./profile/liveKey.ts";
import { CardDetailView } from "./card/CardDetailView.tsx";
import { useRoute } from "./route.ts";

export function App() {
  const state = useBoard();
  const route = useRoute();

  if (route.view === "teammate") {
    const ready = state.phase === "ready";
    return (
      <ProfileView
        teammateId={route.teammateId}
        onChanged={ready ? state.refresh : undefined}
        liveKey={profileLiveKey(route.teammateId, ready ? state.board : undefined)}
      />
    );
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
