import type { BoardResponse, CardResponse } from "@workbench/shared";
import type { BoardConnection } from "../api/useBoard.ts";
import { columnLabel } from "../board/columns.ts";
import { ConnectionIndicator } from "../board/ConnectionIndicator.tsx";
import { cardRef, labelOf } from "../board/teammates.ts";
import { boardHref, cardHref } from "../route.ts";
import {
  cardLogLines,
  checkLines,
  detailMode,
  linkedWork,
  longLabel,
  modeForOwner,
  openQuestions,
  protocolView,
  questionTally,
  readsOf,
  statusText,
  statusTone,
} from "./cardDetail.ts";
import { answerFormId, OpenQuestion } from "./OpenQuestion.tsx";
import { useCardDetail } from "./useCardDetail.ts";

function Breadcrumb({ trail }: { trail?: string }) {
  return (
    <nav className="detail__crumbs" aria-label="Breadcrumb">
      <a href={boardHref}>Team board</a>
      {trail && <> › {trail}</>}
    </nav>
  );
}

/** The Card artboard: one card, its open question, how it is worked, checks, log and linked work. */
export function CardDetailView({ cardId, board, connection }: { cardId: string; board: BoardResponse; connection: BoardConnection }) {
  const state = useCardDetail(cardId, board);

  if (state.phase === "loading") {
    return (
      <main className="detail">
        <Breadcrumb />
        <p className="state-message" role="status">
          Loading {cardRef(cardId)}…
        </p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="detail">
        <Breadcrumb />
        <div className="state-message state-message--error" role="alert">
          <b>{state.notFound ? `There is no card ${cardRef(cardId)} on the board.` : "The card could not be loaded."}</b>
          <span>{state.reason}</span>
          {!state.notFound && (
            <button type="button" className="button" onClick={state.retry}>
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  return <Detail detail={state.detail} board={board} connection={connection} reload={state.reload} />;
}

function Detail({
  detail,
  board,
  connection,
  reload,
}: {
  detail: CardResponse;
  board: BoardResponse;
  connection: BoardConnection;
  reload: () => void;
}) {
  const { card, function: fn } = detail;
  const owner = longLabel(board, card.owner);
  const mode = detailMode(detail, board);
  const ownerLabel = labelOf(board, card.owner);
  const questions = openQuestions(detail, board);
  const resuming = questions.find((q) => q.resumes && q.answerer);
  const protocol = fn && mode ? protocolView(fn, mode, owner) : undefined;
  const checks = checkLines(detail.log, fn);
  const log = cardLogLines(detail.log, board, new Date());
  const linked = linkedWork(card, board);

  return (
    <main className="detail">
      <header className="detail__head">
        <Breadcrumb trail={columnLabel(card.status.state)} />
        <div className="detail__titlebar">
          <div className="detail__heading">
            <h1 className="detail__title">
              <span className="detail__ref" title={card.id}>
                {cardRef(card.id)}
              </span>{" "}
              {card.title}
            </h1>
            <div className="detail__pills">
              <span className={`tag tag--${statusTone(card.status.state)}`}>{statusText(card, board)}</span>
              <span className="tag tag--mono">{card.function_id}</span>
              {mode && <span className={`tag tag--${mode}`}>{modeForOwner(mode, ownerLabel)}</span>}
              <span className="tag tag--neutral">Owner: {owner}</span>
            </div>
          </div>
          <div className="detail__actions">
            <ConnectionIndicator connection={connection} />
            {resuming && (
              <button type="submit" form={answerFormId(resuming.question.id)} className="btn btn--primary">
                Answer and resume
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="detail__body">
        <div className="detail__main">
          {questions.map((q) => (
            <OpenQuestion key={q.question.id} cardId={card.id} view={q} onAnswered={reload} />
          ))}

          <section className="panel" aria-labelledby="worked-head">
            <h2 id="worked-head" className="panel__title">
              How this card is worked
            </h2>
            {!fn && <p className="detail__meta">process/ no longer defines {card.function_id}.</p>}
            {fn && !protocol && <p className="detail__meta">No mode is set for {card.function_id} yet.</p>}
            {protocol && (
              <>
                <p className="detail__meta">
                  From the {owner}'s process map:{" "}
                  <b className={`mode-text--${protocol.mode}`}>{protocol.meaning}</b>.
                </p>
                <div className="protocol">
                  {protocol.cells.map((c) => (
                    <div key={c.label} className="protocol__cell">
                      <span className="label">{c.label}</span>
                      <span className="protocol__value">{c.value}</span>
                    </div>
                  ))}
                </div>
                {protocol.note && <p className="detail__meta">{protocol.note}</p>}
              </>
            )}
            {fn && (
              <div className="artifacts">
                <div className="artifacts__col">
                  <span className="label">Reads</span>
                  {readsOf(fn, card, board).map((r) => (
                    <span key={r.artifact}>
                      <span className="mono">{r.artifact}</span> · {r.source}
                    </span>
                  ))}
                </div>
                <div className="artifacts__col">
                  <span className="label">Writes</span>
                  {fn.outputs.map((o) => (
                    <span key={o.artifact} className="mono">
                      {o.artifact}
                    </span>
                  ))}
                  <span>Decision log · {questionTally(detail.questions)}</span>
                </div>
              </div>
            )}
          </section>

          <section className="panel panel--tight" aria-labelledby="checks-head">
            <h2 id="checks-head" className="panel__title">
              Checks
            </h2>
            {checks.map((c) => (
              <div key={c.kind} className="check">
                <span>
                  <b>{c.name}</b> · {c.by}
                </span>
                <span className={`check__result tone--${c.tone}`}>{c.result}</span>
              </div>
            ))}
          </section>
        </div>

        <aside className="detail__side">
          <section className="panel" aria-labelledby="log-head">
            <h2 id="log-head" className="panel__title">
              Card log
            </h2>
            {log.length === 0 ? (
              <p className="detail__meta">Nothing has happened on this card yet.</p>
            ) : (
              <ol className="card-log">
                {log.map((l) => (
                  <li key={l.id} className="card-log__line">
                    <time className="card-log__time" dateTime={l.at}>
                      {l.time}
                    </time>
                    <span>{l.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel panel--linked" aria-labelledby="linked-head">
            <h2 id="linked-head" className="panel__title">
              Linked work
            </h2>
            {linked.map((l) => (
              <div key={`${l.relation}-${l.id}`} className="linked">
                <span>
                  {l.relation} <a href={cardHref(l.id)}>{l.ref}</a> {l.title}
                </span>
                <span className={`linked__status tone--${l.tone === "neutral" ? "muted" : l.tone}`}>{l.status}</span>
              </div>
            ))}
            <div className="linked">
              <span>Milestone</span>
              <span>{card.milestone ?? "None"}</span>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
