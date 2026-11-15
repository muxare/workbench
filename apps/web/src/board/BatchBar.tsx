import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { ApiRequestError, handBatch } from "../api/client.ts";
import { handOver } from "./batch.ts";

function failure(err: unknown): string {
  const what = "The cards were not handed to the AI";
  return err instanceof ApiRequestError ? `${what}: ${err.reason}.` : `${what}.`;
}

/**
 * The row under the board's header while Ready cards are being ticked for a
 * batch: how many are ticked, what handing them over will do, "Hand to AI"
 * and "Cancel". A refusal from the API shows under it with its reason. After
 * a hand-over the board hears the `batch_handed` event over the stream.
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
  const [error, setError] = useState<string | undefined>();
  const view = handOver(selected, board);

  const send = () => {
    if (sending || !view.ready) return;
    setSending(true);
    setError(undefined);
    handBatch({ actor: view.actor, card_ids: [...selected], handed_to: view.handedTo }).then(
      () => {
        setSending(false);
        onHanded?.();
        onDone();
      },
      (err: unknown) => {
        setSending(false);
        setError(failure(err));
      },
    );
  };

  return (
    <div className="batch-bar" role="region" aria-label="Hand cards to the AI">
      <div className="batch-bar__row">
        <span className="batch-bar__count mono">{selected.length} ticked</span>
        <p className="batch-bar__hint">{view.hint}</p>
        <span className="batch-bar__actions">
          <button type="button" className="btn" disabled={sending} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={sending || !view.ready} onClick={send}>
            {sending ? "Handing over…" : "Hand to AI"}
          </button>
        </span>
      </div>
      {error && (
        <p className="batch-bar__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
