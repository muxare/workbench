// The team screen's writes: add a person, change a person's roles, and the
// "Changing as" picker that names who makes each change, since there is no
// sign-in. The choice is remembered per browser (changingAsStore.ts). Every
// write is answered by the API, and only the team reloaded after it changes
// what the table shows, so a refused change never looks saved.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { HumanTeammate, TeamResponse, TeammateRole } from "@workbench/shared";
import { addTeammate, ApiRequestError, setRoles } from "../api/client.ts";
import { shortLabel } from "../board/teammates.ts";
import { teammateHref } from "../route.ts";
import { readChangingAs, rememberChangingAs } from "./changingAsStore.ts";
import {
  addFailure,
  addFormId,
  addFormProblems,
  addRequest,
  changingAs,
  changingAsChoices,
  editedRoles,
  emptyAddForm,
  hasProblems,
  roleOptions,
  rolesFailure,
  sameRoleList,
  type AddForm,
  type RoleOption,
} from "./teamEdit.ts";

/** Role checkboxes, and the main role when more than one is checked. */
function RoleChoice({
  options,
  roles,
  onChange,
  disabled,
  invalid,
  describedBy,
  legend,
}: {
  options: RoleOption[];
  /** The roles as they would be saved, main role first. */
  roles: TeammateRole[];
  onChange: (roles: TeammateRole[]) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string | undefined;
  legend: string;
}) {
  const checked = new Set(roles);
  const main = roles[0];
  const toggle = (role: TeammateRole, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(role);
    else next.delete(role);
    onChange(editedRoles(roles, next, main));
  };
  return (
    <fieldset className="team-edit__roles" disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}>
      <legend className="team-edit__legend">{legend}</legend>
      <div className="team-edit__checks">
        {options.map((o) => (
          <label key={o.role} className="team-edit__check" title={`${o.title}: ${o.hint} in process/functions`}>
            <input type="checkbox" checked={checked.has(o.role)} onChange={(e) => toggle(o.role, e.target.checked)} />
            <span>{o.title}</span>
            <span className="team-edit__hint mono">{o.hint}</span>
          </label>
        ))}
      </div>
      {roles.length > 1 && (
        <label className="team-edit__main">
          Main role
          <select value={main} onChange={(e) => onChange(editedRoles(roles, checked, e.target.value as TeammateRole))}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {options.find((o) => o.role === r)?.title ?? r}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}

/** One person's roles, saved with the Save button as the person chosen under "Changing as". */
function RolesEditor({
  person,
  options,
  actor,
  onSaved,
}: {
  person: HumanTeammate;
  options: RoleOption[];
  actor: string | undefined;
  onSaved: () => void;
}) {
  const held = person.roles;
  const heldKey = held.join(",");
  const [draft, setDraft] = useState<TeammateRole[]>(held);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const errorId = useId();
  // The roles as they now stand replace the draft, after a save or someone else's change.
  // Keyed on the roles' text, since the API sends a new array with every reload.
  useEffect(() => setDraft(held), [heldKey]);

  const empty = draft.length === 0;
  const changed = !sameRoleList(draft, held);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (actor === undefined || empty || !changed) return;
    setSaving(true);
    setFailure(undefined);
    setSaved(false);
    setRoles(person.id, { actor, roles: draft, was: [...held] }).then(
      () => {
        setSaving(false);
        setSaved(true);
        onSaved();
      },
      (err: unknown) => {
        setSaving(false);
        setFailure(rolesFailure(err, person));
        // A stale view reloads, so the checkboxes show the roles as they stand.
        if (err instanceof ApiRequestError && err.code === "conflict") onSaved();
      },
    );
  };

  return (
    <form className="team-edit__person" onSubmit={save} aria-label={`${person.name}'s roles`} aria-busy={saving}>
      <a className="team-edit__who" href={teammateHref(person.id)}>
        <span className="avatar avatar--md" aria-hidden="true">
          {shortLabel(person, person.id)}
        </span>
        <span className="team-edit__name">
          {person.name}
          <span className="team-edit__hint mono">{person.id}</span>
        </span>
      </a>
      <RoleChoice
        options={options}
        roles={draft}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
        disabled={saving || actor === undefined}
        invalid={empty}
        describedBy={empty ? errorId : undefined}
        legend={`Roles of ${person.name}`}
      />
      <div className="team-edit__actions">
        <button type="submit" className="button" disabled={saving || empty || !changed || actor === undefined}>
          Save roles
        </button>
        {changed && !saving && (
          <button type="button" className="button button--quiet" onClick={() => setDraft(held)}>
            Undo
          </button>
        )}
        {empty && (
          <span id={errorId} className="team-edit__error" role="alert">
            Choose at least one role.
          </span>
        )}
        {saving && (
          <span className="team-edit__status" role="status">
            Saving…
          </span>
        )}
        {saved && (
          <span className="team-edit__status" role="status">
            Saved.
          </span>
        )}
        {failure !== undefined && (
          <span className="team-edit__error" role="alert">
            Not saved: {failure}
          </span>
        )}
      </div>
    </form>
  );
}

/** The form that adds a person, as the person chosen under "Changing as", or as themselves on an empty team. */
function AddPerson({
  team,
  options,
  actor,
  onAdded,
}: {
  team: TeamResponse;
  options: RoleOption[];
  actor: string | undefined;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<AddForm>(emptyAddForm);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [added, setAdded] = useState<string | undefined>();
  const ids = { name: useId(), id: useId(), idNote: useId(), roles: useId() };

  const problems = addFormProblems(form, team);
  const shown = tried ? problems : {};
  const suggested = form.id.trim() === "" ? addFormId(form) : "";
  const update = (next: Partial<AddForm>) => {
    setForm({ ...form, ...next });
    setAdded(undefined);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setFailure(undefined);
    setAdded(undefined);
    if (hasProblems(problems)) return;
    const request = addRequest(form, actor);
    setSending(true);
    addTeammate(request).then(
      (answer) => {
        setSending(false);
        setForm(emptyAddForm);
        setTried(false);
        setAdded(answer.teammate.name);
        onAdded();
      },
      (err: unknown) => {
        setSending(false);
        setFailure(addFailure(err));
      },
    );
  };

  return (
    <form className="team-edit__add" onSubmit={submit} noValidate aria-busy={sending} aria-labelledby={`${ids.name}-heading`}>
      <h3 id={`${ids.name}-heading`} className="team-edit__subhead">
        Add a person
      </h3>
      {actor === undefined && (
        <p className="profile__note">The team has no person yet, so the first person adds themselves.</p>
      )}
      <div className="team-edit__fields">
        <label className="field team-edit__field" htmlFor={ids.name}>
          Name
          <input
            id={ids.name}
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={sending}
            aria-invalid={shown.name !== undefined}
            aria-describedby={shown.name !== undefined ? `${ids.name}-error` : undefined}
            autoComplete="off"
          />
          {shown.name !== undefined && (
            <span id={`${ids.name}-error`} className="team-edit__error">
              {shown.name}
            </span>
          )}
        </label>
        <label className="field team-edit__field" htmlFor={ids.id}>
          Id
          <input
            id={ids.id}
            type="text"
            className="mono"
            value={form.id}
            placeholder={suggested}
            onChange={(e) => update({ id: e.target.value })}
            disabled={sending}
            aria-invalid={shown.id !== undefined}
            aria-describedby={shown.id !== undefined ? `${ids.id}-error` : ids.idNote}
            autoComplete="off"
            spellCheck={false}
          />
          {shown.id !== undefined ? (
            <span id={`${ids.id}-error`} className="team-edit__error">
              {shown.id}
            </span>
          ) : (
            <span id={ids.idNote} className="team-edit__hint">
              {suggested !== "" ? `Left empty, it is ${suggested}, from the name.` : "Names the person in the log and their profile's link."}
            </span>
          )}
        </label>
      </div>
      <RoleChoice
        options={options}
        roles={form.roles}
        onChange={(roles) => update({ roles })}
        disabled={sending}
        invalid={shown.roles !== undefined}
        describedBy={shown.roles !== undefined ? ids.roles : undefined}
        legend="Roles, the main one first"
      />
      <div className="team-edit__actions">
        <button type="submit" className="button" disabled={sending}>
          Add to the team
        </button>
        {shown.roles !== undefined && (
          <span id={ids.roles} className="team-edit__error">
            {shown.roles}
          </span>
        )}
        {sending && (
          <span className="team-edit__status" role="status">
            Adding…
          </span>
        )}
        {added !== undefined && (
          <span className="team-edit__status" role="status">
            Added {added}.
          </span>
        )}
        {failure !== undefined && (
          <span className="team-edit__error" role="alert">
            Not added: {failure}
          </span>
        )}
      </div>
    </form>
  );
}

/** "People and roles": who changes are made as, each person's roles, and the add form. */
export function PeoplePanel({ team, onChanged }: { team: TeamResponse; onChanged: () => void }) {
  const [remembered, setRemembered] = useState<string | undefined>(() => readChangingAs());
  const actor = changingAs(team, remembered);
  const choices = changingAsChoices(team);
  const options = roleOptions(team);
  const choose = (id: string) => {
    setRemembered(id);
    rememberChangingAs(id);
  };

  return (
    <section className="profile__panel team-edit" aria-labelledby="people-heading">
      <div className="profile__panel-head">
        <h2 id="people-heading">People and roles</h2>
        {actor !== undefined && (
          <label className="team-edit__as">
            Changing as
            <select value={actor} onChange={(e) => choose(e.target.value)}>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="profile__note">
        There is no sign-in yet, so each change is recorded as made by the person chosen under “Changing as”. This browser remembers
        the choice. The first role is the main one, which seats the person on the board.
      </p>
      {team.people.map(({ teammate }) => (
        <RolesEditor key={teammate.id} person={teammate} options={options} actor={actor} onSaved={onChanged} />
      ))}
      <AddPerson team={team} options={options} actor={actor} onAdded={onChanged} />
    </section>
  );
}
