import { useEffect, useState, type FormEvent } from "react";
import type { BoardResponse, CardResponse } from "@workbench/shared";
import { ApiRequestError, askQuestion } from "../api/client.ts";
import { readChangingAs, rememberChangingAs } from "../team/changingAsStore.ts";
import { askDraft, askedOfChoices, askedOfDefault, askHint, askView } from "./cardAsk.ts";

/**
 * "Ask a question" on a card in progress with no open question: whom, the
 * question and why it blocks. After the API accepts it the card screen
 * reloads, and the live board moves the card to Needs input from the stream.
 */
export function AskQuestion({ detail, board, onAsked }: { detail: CardResponse; board: BoardResponse; onAsked: () => void }) {
  const [remembered, setRemembered] = useState<string | undefined>(() => readChangingAs());
  const [chosenOf, setChosenOf] = useState<string | undefined>();
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const view = askView(detail, board, remembered);
  // A refusal belongs to the moment it was given: when the card moves on and
  // the panel goes away, drop it, so it does not reappear stale later.
  useEffect(() => {
    if (view.kind === "none") setError(undefined);
  }, [view.kind]);
  if (view.kind === "none") return null;

  const { card } = detail;
  const choices = askedOfChoices(board, card.owner, view.asker);
  const askedOf = askedOfDefault(choices, chosenOf);

  const chooseAsker = (id: string) => {
    setRemembered(id);
    rememberChangingAs(id);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const draft = askDraft(view.asker, askedOf, text, why);
    if (!draft.ok) {
      setError(draft.reason);
      return;
    }
    setSending(true);
    setError(undefined);
    askQuestion(card.id, draft.request).then(
      () => {
        setSending(false);
        setText("");
        setWhy("");
        onAsked();
      },
      (err: unknown) => {
        setSending(false);
        setError(err instanceof ApiRequestError ? `The question was not asked: ${err.reason}.` : "The question was not asked.");
      },
    );
  };

  return (
    <section className="panel" aria-labelledby="ask-head">
      <div className="panel__row">
        <h2 id="ask-head" className="panel__title">
          Ask a question
        </h2>
        <label className="field field--inline">
          Asking as
          <select value={view.asker} onChange={(e) => chooseAsker(e.target.value)} disabled={sending}>
            {view.askers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form className="question__form" onSubmit={submit}>
        <label className="field">
          Ask whom
          <select value={askedOf ?? ""} onChange={(e) => setChosenOf(e.target.value)} disabled={sending || choices.length === 0}>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Question, written so they can answer without opening the work
          <textarea rows={3} value={text} aria-invalid={error !== undefined} onChange={(e) => setText(e.target.value)} disabled={sending} />
        </label>
        <label className="field">
          Why it blocks the work
          <textarea rows={2} value={why} aria-invalid={error !== undefined} onChange={(e) => setWhy(e.target.value)} disabled={sending} />
        </label>
        <div className="question__actions">
          <span className="detail__meta">{askHint(board, askedOf)}</span>
          <button type="submit" className="btn btn--primary" disabled={sending || askedOf === undefined}>
            {sending ? "Asking…" : "Ask"}
          </button>
        </div>
        {error && (
          <p className="ask__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
