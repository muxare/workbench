import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { ApiRequestError, handBatch } from "../api/client.ts";
import { handOver, refusalText } from "./batch.ts";

/**
 * The row under the board's header while Ready cards are being selected for
 * a batch: how many are selected, what handing them over will do, "Cancel"
 * and "Hand to AI". A refusal from the API shows under it with its reason
 * until the selection changes. After a hand-over the board hears the
 * `batch_handed` event over the stream.
 */
export function BatchBar({
  board,
  selected,
  onDone,
  onHanded,
}: {
  board: BoardResponse;
  selected: readonly string[];
  onDone: () => void;
  onHanded?: (() => void) | undefined;
}) {
  const [sending, setSending] = useState(false);
  // The refusal belongs to the selection it was for; another selection hides it.
  const [error, setError] = useState<{ selection: string; text: string } | undefined>();
  const view = handOver(selected, board);
  const key = selected.join(" ");
  const shownError = error?.selection === key ? error.text : undefined;

  const handed = () => {
    setSending(false);
    onHanded?.();
    onDone();
  };

  const send = () => {
    if (sending || !view.ready) return;
    setSending(true);
    setError(undefined);
    handBatch({ actor: view.actor, card_ids: [...selected] }).then(handed, (err: unknown) => {
      // A 2xx whose body does not parse was still a hand-over; the board refetches and shows it.
      if (err instanceof ApiRequestError && err.code === "bad_response") return handed();
      setSending(false);
      const what = "The cards were not handed to the AI";
      setError({ selection: key, text: err instanceof ApiRequestError ? `${what}: ${refusalText(err.reason, board)}.` : `${what}.` });
    });
  };

  return (
    <div className="batch-bar" role="region" aria-label="Hand selected cards to the AI">
      <div className="batch-bar__row">
        <span className="batch-bar__count mono">{selected.length} selected</span>
        <p className="batch-bar__hint">{view.hint}</p>
        <span className="batch-bar__actions">
          <button type="button" className="btn btn--compact" disabled={sending} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn--compact btn--primary" disabled={sending || !view.ready} onClick={send}>
            {sending ? "Handing over…" : "Hand to AI"}
          </button>
        </span>
      </div>
      {shownError && (
        <p className="batch-bar__error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
