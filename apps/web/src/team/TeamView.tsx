import { Legend } from "../board/Legend.tsx";
import { boardHref } from "../route.ts";
import { aiPickCount, emptyReason, teamColumns, teamRows, teamScreen, type TeamCellView } from "./teamView.ts";
import { useTeam } from "./useTeam.ts";
import "../profile/profile.css";
import "./team.css";

function Cell({ cell }: { cell: TeamCellView }) {
  if (cell.kind === "none") {
    return (
      <td className="team__cell team__cell--none">
        <a className="team__link" href={cell.href} title={cell.description} aria-label={cell.description}>
          <span aria-hidden="true">–</span>
        </a>
      </td>
    );
  }
  return (
    <td className="team__cell">
      <a className="team__link" href={cell.href} title={cell.description} aria-label={cell.description}>
        <span className={`pill pill--${cell.mode}`}>{cell.label}</span>
        <span className="team__meta mono" aria-hidden="true">
          {cell.aiMayPick && <span className="avatar avatar--sm avatar--ai team__ai">AI</span>}
          {cell.isDefault && <span>default</span>}
        </span>
      </a>
    </td>
  );
}

function Header() {
  return (
    <header className="profile__head">
      <div className="profile__intro">
        <nav className="profile__crumbs" aria-label="Breadcrumb">
          <a href={boardHref}>Team board</a> › Team
        </nav>
        <h1>How the team works with AI</h1>
        <p>Every person against every step: the mode each one works it in, and whether the AI may pick its cards on its own. Open a cell to change it on that person's profile.</p>
      </div>
      <Legend />
    </header>
  );
}

/** `#/team`: every person against every step, read from `GET /api/team`. */
export function TeamView({ liveKey }: { liveKey?: string | undefined }) {
  const state = useTeam(liveKey);

  if (state.phase === "loading") {
    return (
      <main className="page page--centered">
        <p className="state-message" role="status">
          Loading the team…
        </p>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <main className="page page--centered">
        <div className="state-message state-message--error" role="alert">
          <b>The team could not be loaded.</b>
          <span>{state.reason}</span>
          <button type="button" className="button" onClick={state.retry}>
            Try again
          </button>
          <a href={boardHref}>Back to the team board</a>
        </div>
      </main>
    );
  }

  const { team } = state;
  if (teamScreen(state) === "empty") {
    return (
      <main className="profile">
        <Header />
        <section className="profile__panel" aria-label="The team">
          <p className="profile__empty">{emptyReason(team)}</p>
        </section>
      </main>
    );
  }

  const columns = teamColumns(team);
  const rows = teamRows(team);
  const picks = aiPickCount(team);

  return (
    <main className="profile">
      <Header />
      <section className="profile__panel team" aria-labelledby="team-heading">
        <div className="profile__panel-head">
          <h2 id="team-heading">Steps and people</h2>
          <span className="profile__note">
            The AI may pick on its own in <b>{picks.may}</b> of {picks.total} steps people work.
          </span>
        </div>
        <div className="team__scroll">
          <table className="team__table">
            <thead>
              <tr>
                <th scope="col" className="team__corner">
                  Step
                </th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className="team__person">
                    <a href={c.href} title={c.name}>
                      <span className="avatar avatar--md">{c.label}</span>
                      <span className="team__roles">{c.roles}</span>
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.step.function_id}>
                  <th scope="row" className="team__step">
                    <span className="step__title">{row.step.title}</span>
                    <span className="step__sub mono" title={row.step.summary}>
                      {row.step.role} · {row.step.function_id}
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <Cell key={cell.personId} cell={cell} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="profile__note team__key">
          <span className="avatar avatar--sm avatar--ai team__ai" aria-hidden="true">
            AI
          </span>{" "}
          the AI may pick a Ready card on the step on its own. “default” means the person has not chosen a mode, so the step's default
          applies. – means the step is not in that person's chain. Follows from each person's modes and what the AI teammate can do today.
        </p>
      </section>
    </main>
  );
}
