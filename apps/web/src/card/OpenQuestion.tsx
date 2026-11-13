import { useState, type FormEvent } from "react";
import { ApiRequestError, answerQuestion } from "../api/client.ts";
import { formatTime } from "../board/log.ts";
import { answerDraft, type OpenQuestionView } from "./cardDetail.ts";

/** The form id the header's "Answer and resume" button submits. */
export function answerFormId(questionId: string): string {
  return `answer-${questionId}`;
}

/** The Card artboard's "Open question" panel with its answer form. */
export function OpenQuestion({ cardId, view, onAnswered }: { cardId: string; view: OpenQuestionView; onAnswered: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { question: q, answerer } = view;
  const formId = answerFormId(q.id);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sending || !answerer) return;
    const draft = answerDraft(text);
    if (!draft.ok) {
      setError(draft.reason);
      return;
    }
    setSending(true);
    setError(undefined);
    answerQuestion(cardId, q.id, { actor: answerer, answer: draft.answer }).then(
      () => {
        setSending(false);
        setText("");
        onAnswered();
      },
      (err: unknown) => {
        setSending(false);
        setError(err instanceof ApiRequestError ? `The answer was not saved: ${err.reason}.` : "The answer was not saved.");
      },
    );
  };

  return (
    <section className="panel panel--needs-input" aria-labelledby={`${formId}-head`}>
      <div className="panel__row">
        <h2 id={`${formId}-head`} className="panel__title tone--needs-input">
          Open question
        </h2>
        <span className="mono detail__meta">
          {view.route}
          {view.at && ` · ${formatTime(view.at)}`}
        </span>
      </div>
      <p className="question__text">{q.text}</p>
      {view.relay && <p className="question__why">{view.relay}</p>}
      <p className="question__why">Why it blocks: {q.why_it_blocks}</p>
      {answerer ? (
        <form id={formId} className="question__form" onSubmit={submit}>
          <label className="field">
            Answer, and why (kept in the decision log)
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={sending}
              aria-invalid={error !== undefined}
            />
          </label>
          <div className="question__actions">
            <span className="detail__meta">Answering as {view.answererLabel}</span>
            {!view.resumes && (
              <button type="submit" className="btn btn--primary" disabled={sending}>
                {sending ? "Sending…" : "Answer"}
              </button>
            )}
          </div>
          {error && (
            <p className="question__error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="detail__meta">No person on the team can answer this from here.</p>
      )}
    </section>
  );
}
