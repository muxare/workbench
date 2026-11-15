import { useState } from "react";
import type { BoardResponse, CardResponse, Mode } from "@workbench/shared";
import { ApiRequestError, moveCard, pickCard, setMode } from "../api/client.ts";
import { modeMeaning } from "../board/modes.ts";
import { cardMoves, pickHint, pickSteps } from "./cardMoves.ts";

function failure(what: string, err: unknown): string {
  return err instanceof ApiRequestError ? `${what}: ${err.reason}.` : `${what}.`;
}

/**
 * The card header's moves before work starts: "Move to Ready" on a Backlog
 * card; on a Ready card, a mode choice, "Pick" and "Back to Backlog". The
 * state is local; after a write the card screen reloads the card, and the
 * board follows the event stream.
 */
export function CardMoves({ detail, board, onMoved }: { detail: CardResponse; board: BoardResponse; onMoved: () => void }) {
  const view = cardMoves(detail, board);
  const [sending, setSending] = useState<"move" | "pick" | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [choice, setChoice] = useState<Mode | undefined>();
  const { card } = detail;

  if (view.kind === "none") return null;

  const run = (action: "move" | "pick", what: string, work: () => Promise<unknown>) => {
    if (sending) return;
    setSending(action);
    setError(undefined);
    work().then(
      () => {
        setSending(undefined);
        setChoice(undefined);
        onMoved();
      },
      (err: unknown) => {
        setSending(undefined);
        setError(failure(what, err));
        // A mode change may have been saved before a refused pick; show the card as it now stands.
        onMoved();
      },
    );
  };

  if (view.kind === "open") {
    return (
      <div className="moves">
        <button
          type="button"
          className="btn btn--primary"
          disabled={sending !== undefined}
          onClick={() => run("move", "The card was not moved", () => moveCard(card.id, { actor: view.actor, from: "backlog", to: { state: "ready" } }))}
        >
          {sending === "move" ? "Moving…" : "Move to Ready"}
        </button>
        {error && (
          <p className="moves__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const chosen = choice ?? view.current;
  const pick = () =>
    run("pick", "The card was not picked", async () => {
      for (const step of pickSteps(view, chosen)) {
        if (step === "set_mode") await setMode(view.actor, { actor: view.actor, function_id: view.functionId, mode: chosen });
        else await pickCard(card.id, { actor: view.actor, mode: chosen });
      }
    });

  return (
    <div className="moves">
      <div className="moves__row">
        <button
          type="button"
          className="btn"
          disabled={sending !== undefined}
          onClick={() => run("move", "The card was not moved", () => moveCard(card.id, { actor: view.actor, from: "ready", to: { state: "backlog" } }))}
        >
          {sending === "move" ? "Moving…" : "Back to Backlog"}
        </button>
        <label className="moves__mode">
          <span className="label">Mode</span>
          <select value={chosen} onChange={(e) => setChoice(e.target.value as Mode)} disabled={sending !== undefined || view.blocked !== undefined}>
            {view.allowed.map((m) => (
              <option key={m} value={m}>
                {modeMeaning[m]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--primary" disabled={sending !== undefined || view.blocked !== undefined} onClick={pick}>
          {sending === "pick" ? "Picking…" : "Pick"}
        </button>
      </div>
      <p className="moves__hint">{view.blocked ?? pickHint(view, chosen)}</p>
      {error && (
        <p className="moves__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
