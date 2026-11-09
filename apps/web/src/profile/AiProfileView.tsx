import { cardEventType, type BoardResponse } from "@workbench/shared";
import { ModePill } from "../board/ModePill.tsx";
import { modeMeaning } from "../board/modes.ts";
import { boardHref } from "../route.ts";
import {
  aiStepRows,
  nextItems,
  notNextItems,
  nowItems,
  ownerModeShares,
  pickCount,
  questionItems,
  recentLines,
  runFacts,
  type AiStepRow,
  type CardItem,
} from "./aiProfileView.ts";
import { LogFilter } from "../board/LogFilter.tsx";
import { useAiProfile } from "./useAiProfile.ts";
import "./profile.css";

function StepRow({ row }: { row: AiStepRow }) {
  const refused = row.owners.filter((o) => !o.mayPick);
  return (
    <li className="step">
      <div className="step__text">
        <span className="step__title">{row.title}</span>
        <span className="step__sub mono" title={row.summary}>
          {row.subline}
        </span>
        {refused.map((o) => (
          <span key={o.teammateId} className="ai-step__reason">
            {o.label}: {o.reason}
          </span>
        ))}
      </div>
      <ul className="ai-owners" aria-label="Owners and whether the AI may pick their cards">
        {row.owners.length === 0 && <li className="ai-owner ai-owner--none">Nobody on the team owns this step</li>}
        {row.owners.map((o) => (
          <li key={o.teammateId} className={`ai-owner${o.mayPick ? "" : " ai-owner--off"}`}>
            <span className="avatar avatar--sm">{o.label}</span>
            <ModePill mode={o.mode} />
            <span className="ai-owner__verdict">{o.mayPick ? "I may pick" : "Not mine"}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function CardList({ items, empty }: { items: CardItem[]; empty: string }) {
  if (items.length === 0) return <p className="profile__note">{empty}</p>;
  return (
    <ul className="ai-cards">
      {items.map((c) => (
        <li key={c.id} className="ai-card">
          <span className="ai-card__head">
            <a className="mono ai-card__ref" href={c.href} title={c.id}>
              {c.ref}
            </a>
            <ModePill mode={c.mode} />
          </span>
          <a className="ai-card__title" href={c.href}>
            {c.title}
          </a>
          <span className={`ai-card__note tone--${c.tone}`}>{c.note}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The AI teammate's profile. No artboard draws it; it follows the Profile
 * artboard's layout and draws the AI as the Main artboard's AI panel does.
 */
export function AiProfileView({ teammateId, board }: { teammateId: string; board: BoardResponse }) {
  const state = useAiProfile(teammateId, board);

  if (state.phase === "loading") {
    return (
      <main className="page page--centered">
        <p className="state-message" role="status">
          Loading the profile…
        </p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="page page--centered">
        <div className="state-message state-message--error" role="alert">
          <b>The profile could not be loaded.</b>
          <span>{state.reason}</span>
          <button type="button" className="button" onClick={state.retry}>
            Try again
          </button>
          <a href={boardHref}>Back to the team board</a>
        </div>
      </main>
    );
  }

  const { profile } = state;
  const facts = runFacts(profile);
  const rows = aiStepRows(profile.steps, board);
  const shares = ownerModeShares(profile.steps);
  const picks = pickCount(profile.steps);
  const now = nowItems(profile, board);
  const next = nextItems(profile, board);
  const notNext = notNextItems(profile);
  const questions = questionItems(profile, board);
  const recent = recentLines(profile, board);

  return (
    <main className="profile">
      <header className="profile__head">
        <span className="avatar avatar--xl avatar--ai" title={profile.teammate.name}>
          AI
        </span>
        <div className="profile__intro">
          <nav className="profile__crumbs" aria-label="Breadcrumb">
            <a href={boardHref}>Team board</a> › Team › <span>{profile.teammate.name}</span>
          </nav>
          <h1>How I work with the team</h1>
          <p>I work in the mode each person set for the step. Change a step on your own profile and I follow it from the next pick.</p>
          <p className="ai-facts mono">
            Works in: {facts.worksIn}
            {facts.notYet !== undefined && ` · Not yet: ${facts.notYet}`} · {facts.runs}
          </p>
        </div>
      </header>

      <div className="profile__body">
        <section className="profile__panel profile__chain" aria-labelledby="ai-steps-heading">
          <div className="profile__summary">
            <h2 id="ai-steps-heading">Steps I may work</h2>
            <div className="mode-bar" aria-hidden="true">
              {shares.map((s) => (
                <span key={s.mode} className={`mode-bar__part mode-bar__part--${s.mode}`} style={{ width: `${s.percent}%` }} />
              ))}
            </div>
            <div className="mode-totals">
              {shares.map((s) => (
                <span key={s.mode}>
                  <b className={`mode-text--${s.mode}`}>{s.count}</b> {modeMeaning[s.mode]}
                </span>
              ))}
            </div>
            <p className="profile__note">
              The bar counts each person on each step in their mode. I may pick on {picks.may} of {picks.total}.
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="profile__empty">No steps. process/ defines no functions.</p>
          ) : (
            <ul className="steps">
              {rows.map((row) => (
                <StepRow key={row.functionId} row={row} />
              ))}
            </ul>
          )}
        </section>

        <aside className="profile__aside">
          <section className="profile__panel" aria-labelledby="ai-now-heading">
            <h2 id="ai-now-heading">On now</h2>
            <CardList items={now} empty="No card. I am not working on anything." />
          </section>

          <section className="profile__panel" aria-labelledby="ai-next-heading">
            <h2 id="ai-next-heading">I may pick next</h2>
            <CardList items={next} empty="Nothing in Ready that I may pick." />
            {notNext.length > 0 && (
              <>
                <h3 className="ai-subhead">In Ready, not mine</h3>
                <ul className="ai-cards">
                  {notNext.map((c) => (
                    <li key={c.id} className="ai-card">
                      <span className="ai-card__head">
                        <a className="mono ai-card__ref" href={c.href} title={c.id}>
                          {c.ref}
                        </a>
                        <a className="ai-card__title" href={c.href}>
                          {c.title}
                        </a>
                      </span>
                      <span className="ai-card__note tone--muted">{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="profile__panel" aria-labelledby="ai-questions-heading">
            <h2 id="ai-questions-heading">Questions I asked</h2>
            {questions.length === 0 ? (
              <p className="profile__note">None yet.</p>
            ) : (
              <ul className="ai-cards">
                {questions.map((q) => (
                  <li key={q.id} className="ai-card">
                    <span className="ai-card__head">
                      <a className="mono ai-card__ref" href={q.href}>
                        {q.ref}
                      </a>
                      <span className={`ai-card__note${q.open ? " tone--needs-input is-strong" : " tone--muted"}`}>{q.status}</span>
                    </span>
                    <span>{q.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="profile__panel" aria-labelledby="ai-recent-heading">
            <div className="profile__panel-head">
              <h2 id="ai-recent-heading">What I did last</h2>
              <LogFilter log="teammate" board={board} offered={cardEventType.options} />
            </div>
            {recent.length === 0 ? (
              <p className="profile__note">{profile.recent.length === 0 ? "Nothing yet." : "The filter hides everything I did last."}</p>
            ) : (
              <ol className="ai-log">
                {recent.map((l) => (
                  <li key={l.id}>
                    <time className="mono" dateTime={l.at}>
                      {l.time}
                    </time>{" "}
                    {l.text}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="profile__panel profile__panel--prose" aria-labelledby="ai-always-heading">
            <h2 id="ai-always-heading">Always yours</h2>
            <p>A person decides in every mode. I ask and report; I never answer a question or move a card past Needs input.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
