import type { Mode, ProfileStep } from "@workbench/shared";
import { modeMeaning } from "../board/modes.ts";
import { roleTitle, shortLabel } from "../board/teammates.ts";
import { boardHref } from "../route.ts";
import { aiPickSteps, modeButtons, modeShares, stepSubline } from "./profileView.ts";
import { useProfile } from "./useProfile.ts";
import "./profile.css";

function StepRow({
  step,
  saving,
  failure,
  choose,
}: {
  step: ProfileStep;
  saving: boolean;
  failure: string | undefined;
  choose: (mode: Mode) => void;
}) {
  return (
    <li className="step">
      <div className="step__text">
        <span className="step__title">{step.title}</span>
        <span className="step__sub mono" title={step.summary}>
          {stepSubline(step)}
          {step.mode_is_default && " · default"}
        </span>
        {failure !== undefined && (
          <span className="step__failure" role="alert">
            Not saved: {failure}
          </span>
        )}
      </div>
      <div className="mode-switch" role="group" aria-label="Who does this step" aria-busy={saving}>
        {modeButtons(step).map((b) => (
          <button
            key={b.mode}
            type="button"
            className={`mode-switch__button${b.pressed ? ` mode-switch__button--${b.mode}` : ""}`}
            aria-pressed={b.pressed}
            disabled={!b.allowed || saving}
            title={b.allowed ? modeMeaning[b.mode] : `${modeMeaning[b.mode]}: not allowed for this step in process/`}
            onClick={() => {
              if (!b.pressed) choose(b.mode);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </li>
  );
}

/** The Profile artboard: a person's chain of steps with a mode per step. */
export function ProfileView({ teammateId, onChanged }: { teammateId: string; onChanged: (() => void) | undefined }) {
  const state = useProfile(teammateId, onChanged);

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

  const { profile, saving, failure, choose } = state;
  const { teammate, steps } = profile;
  const shares = modeShares(steps);
  const aiSteps = aiPickSteps(steps);

  return (
    <main className="profile">
      <header className="profile__head">
        <span className="avatar avatar--xl" title={teammate.name}>
          {shortLabel(teammate, teammate.id)}
        </span>
        <div className="profile__intro">
          <nav className="profile__crumbs" aria-label="Breadcrumb">
            <a href={boardHref}>Team board</a> › Team › <span title={teammate.name}>{roleTitle[teammate.role]}</span>
          </nav>
          <h1>How I work with AI</h1>
          <p>This sets how the AI joins every card I pick. Change a step and the board shows it on my cards from the next pick.</p>
        </div>
      </header>

      <div className="profile__body">
        <section className="profile__panel profile__chain" aria-labelledby="chain-heading">
          <div className="profile__summary">
            <h2 id="chain-heading">My chain of steps</h2>
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
          </div>
          {steps.length === 0 ? (
            <p className="profile__empty">No steps yet. The function files in process/ give this role none, and no mode is set for another step.</p>
          ) : (
            <ul className="steps">
              {steps.map((step) => (
                <StepRow
                  key={step.function_id}
                  step={step}
                  saving={saving === step.function_id}
                  failure={failure?.functionId === step.function_id ? failure.reason : undefined}
                  choose={(mode) => choose(step.function_id, mode)}
                />
              ))}
            </ul>
          )}
          {profile.unknown_functions.length > 0 && (
            <p className="profile__note">
              Also set, but not in process/: <span className="mono">{profile.unknown_functions.join(", ")}</span>
            </p>
          )}
        </section>

        <aside className="profile__aside">
          <section className="profile__panel" aria-labelledby="autopick-heading">
            <h2 id="autopick-heading">The AI may pick on its own</h2>
            {aiSteps.length === 0 ? (
              <p>Nothing. No step is in a mode the AI teammate works in.</p>
            ) : (
              <>
                <p>Cards in Ready on these steps:</p>
                <ul className="profile__list">
                  {aiSteps.map((s) => (
                    <li key={s.function_id}>
                      {s.title} <span className="mono profile__fn">{s.function_id}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="profile__note">Follows from the modes above and what the AI teammate can do today.</p>
          </section>

          <section className="profile__panel profile__panel--prose" aria-labelledby="always-heading">
            <h2 id="always-heading">Always mine</h2>
            <p>Deciding stays with a person in every mode. On delegated steps the AI writes and I verify before the card moves.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
