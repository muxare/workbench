import { useId, useState, type FormEvent } from "react";
import type { BoardResponse } from "@workbench/shared";
import { ApiRequestError, createCard } from "../api/client.ts";
import { readChangingAs, rememberChangingAs } from "../team/changingAsStore.ts";
import { refusalText } from "./batch.ts";
import {
  createdNote,
  creatorDefault,
  functionChoices,
  milestoneChoices,
  newCardDraft,
  ownerDefault,
  ownerShown,
  personChoices,
} from "./newCard.ts";

/**
 * The form under the board's header that "New card" on the Backlog column
 * opens: title, function, owner, milestone and "Creating as". After the API
 * accepts the card the form says which number it got, with a link, and stays
 * open for the next one; the board hears the `card_created` event over the
 * stream and the card appears in Backlog without a reload.
 */
export function NewCard({ board, onClose, onCreated }: { board: BoardResponse; onClose: () => void; onCreated?: (() => void) | undefined }) {
  const [remembered, setRemembered] = useState<string | undefined>(() => readChangingAs());
  const [title, setTitle] = useState("");
  const [functionId, setFunctionId] = useState("");
  const [chosenOwner, setChosenOwner] = useState<string | undefined>();
  const [milestone, setMilestone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<string | undefined>();
  const milestonesId = useId();

  const people = personChoices(board);
  const creator = creatorDefault(board, remembered);
  const owner = ownerShown(board, chosenOwner, ownerDefault(board, functionId || undefined, creator));
  const milestones = milestoneChoices(board);
  const note = created === undefined ? undefined : createdNote(created);

  // Any edit starts a new card: the last refusal or "Created" no longer describes it.
  const edited = () => {
    setError(undefined);
    setCreated(undefined);
  };

  const chooseCreator = (id: string) => {
    setRemembered(id);
    rememberChangingAs(id);
    edited();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const draft = newCardDraft({ creator, title, functionId, owner, milestone });
    if (!draft.ok) {
      setError(draft.reason);
      setCreated(undefined);
      return;
    }
    setSending(true);
    setError(undefined);
    setCreated(undefined);
    createCard(draft.request).then(
      (res) => {
        setSending(false);
        setTitle("");
        setCreated(res.card.id);
        onCreated?.();
      },
      (err: unknown) => {
        setSending(false);
        const what = "The card was not created";
        setError(err instanceof ApiRequestError ? `${what}: ${refusalText(err.reason, board)}.` : `${what}.`);
      },
    );
  };

  return (
    <form id="new-card" className="new-card" aria-labelledby="new-card-head" onSubmit={submit}>
      <div className="new-card__row">
        <h3 id="new-card-head" className="new-card__title">
          New card in Backlog
        </h3>
        <label className="field field--inline new-card__as">
          Creating as
          <select value={creator ?? ""} onChange={(e) => chooseCreator(e.target.value)} disabled={sending || people.length === 0}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="new-card__fields">
        <label className="field new-card__wide">
          Title
          <input
            type="text"
            value={title}
            disabled={sending}
            aria-invalid={error !== undefined && !title.trim()}
            onChange={(e) => {
              setTitle(e.target.value);
              edited();
            }}
          />
        </label>
        <label className="field">
          Function
          <select
            value={functionId}
            disabled={sending}
            aria-invalid={error !== undefined && !functionId}
            onChange={(e) => {
              setFunctionId(e.target.value);
              edited();
            }}
          >
            <option value="">Choose a function</option>
            {functionChoices(board).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Owner
          <select
            value={owner ?? ""}
            disabled={sending || people.length === 0}
            onChange={(e) => {
              setChosenOwner(e.target.value);
              edited();
            }}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Milestone, optional
          <input
            type="text"
            value={milestone}
            list={milestonesId}
            disabled={sending}
            onChange={(e) => {
              setMilestone(e.target.value);
              edited();
            }}
          />
          <datalist id={milestonesId}>
            {milestones.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="new-card__row">
        <p className="new-card__hint">
          {note ? (
            <span role="status">
              {note.text} <a href={note.href}>Open {note.ref}</a>
            </span>
          ) : (
            "The card starts in Backlog. Nothing else happens until someone moves it to Ready."
          )}
        </p>
        <span className="new-card__actions">
          <button type="button" className="btn btn--compact" disabled={sending} onClick={onClose}>
            {note ? "Close" : "Cancel"}
          </button>
          <button type="submit" className="btn btn--compact btn--primary" disabled={sending || creator === undefined}>
            {sending ? "Creating…" : "Create card"}
          </button>
        </span>
      </div>
      {error && (
        <p className="new-card__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
