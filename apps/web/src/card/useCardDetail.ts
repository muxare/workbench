// One card's detail, kept current. Loads `GET /api/cards/:id` and loads it
// again whenever the live board (which follows the SSE stream in `useBoard`)
// shows a change to this card: a new event on it or a new status. The card
// screen therefore needs no stream of its own.
import { useCallback, useEffect, useState } from "react";
import { isCardEvent, type BoardResponse, type CardResponse } from "@workbench/shared";
import { ApiRequestError, fetchCard } from "../api/client.ts";

export type CardDetailState =
  | { phase: "loading" }
  | { phase: "error"; reason: string; notFound: boolean; retry: () => void }
  | { phase: "ready"; detail: CardResponse; reload: () => void };

/**
 * What the board knows about one card: the ids of its events in the board's
 * log and its status. When this changes, the card detail is out of date.
 */
export function refreshKey(cardId: string, board: BoardResponse): string {
  const events = board.log.filter((e) => isCardEvent(e) && e.card_id === cardId).map((e) => e.id);
  const status = board.cards.find((c) => c.id === cardId)?.status;
  return JSON.stringify([events, status ?? null]);
}

export function useCardDetail(cardId: string, board: BoardResponse): CardDetailState {
  const key = refreshKey(cardId, board);
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const [state, setState] = useState<CardDetailState>({ phase: "loading" });
  const [shownId, setShownId] = useState(cardId);

  // Another card: show loading instead of the previous card's detail.
  if (shownId !== cardId) {
    setShownId(cardId);
    setState({ phase: "loading" });
  }

  useEffect(() => {
    const abort = new AbortController();
    fetchCard(cardId, abort.signal).then(
      (detail) => setState({ phase: "ready", detail, reload }),
      (err: unknown) => {
        if (abort.signal.aborted) return;
        // Keep a card already shown when a refresh fails; the next change retries.
        setState((s) =>
          s.phase === "ready"
            ? s
            : {
                phase: "error",
                reason: err instanceof ApiRequestError ? err.reason : "the card could not be loaded",
                notFound: err instanceof ApiRequestError && err.code === "not_found",
                retry: reload,
              },
        );
      },
    );
    return () => abort.abort();
  }, [cardId, key, reloads, reload]);

  return state;
}
