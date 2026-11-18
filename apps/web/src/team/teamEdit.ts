// The team screen's writes, as pure functions: who a change is made as, the
// roles a person may hold, the add form's checks, what taking a person off
// the team says, and the messages for a refused write. The roles are the shared `teammateRole` list; how many steps
// each one owns is counted from the team's steps, which the API reads from
// process/functions, so nothing here names a function.
import { newTeammateId, sameRoles, teammateIdFromName, teammateRole } from "@workbench/shared";
import type { AddTeammateRequest, HumanTeammate, LeaveTeamRequest, TeamResponse, TeammateRole } from "@workbench/shared";
import { ApiRequestError } from "../api/client.ts";
import { defaultActor, roleTitle, shortLabel } from "../board/teammates.ts";

/** The people a change can be made as: every person on the team, in the API's order. */
export function changingAsChoices(team: TeamResponse): { id: string; label: string }[] {
  return team.people.map(({ teammate }) => ({ id: teammate.id, label: `${shortLabel(teammate, teammate.id)} · ${teammate.name}` }));
}

/**
 * Who a change is made as: the person this browser chose last, while they are
 * still on the team; otherwise the product owner, who owns the board's order,
 * or else the first person, as the log filter's "Changing as" chooses.
 * Undefined on a team with no person, where the first person adds themselves.
 */
export function changingAs(team: TeamResponse, remembered: string | undefined): string | undefined {
  const people = team.people.map((p) => p.teammate);
  if (remembered !== undefined && people.some((p) => p.id === remembered)) return remembered;
  return defaultActor(people);
}

export interface RoleOption {
  role: TeammateRole;
  title: string;
  /** How many steps in process/functions the role owns, for the hint beside it. */
  steps: number;
  hint: string;
}

/** Every role a person may hold, in the shared order, each with how many steps it owns. */
export function roleOptions(team: TeamResponse): RoleOption[] {
  return teammateRole.options.map((role) => {
    const steps = team.steps.filter((s) => s.role === role).length;
    return { role, title: roleTitle[role], steps, hint: steps === 0 ? "no steps" : steps === 1 ? "1 step" : `${String(steps)} steps` };
  });
}

/**
 * The roles a person holds after an edit: `main` first, then the other
 * checked roles in the order the person held them, then newly checked roles
 * in the shared order. `main` falls back to the first of those when it is not
 * checked. Empty when nothing is checked.
 */
export function editedRoles(held: readonly TeammateRole[], checked: ReadonlySet<TeammateRole>, main: TeammateRole | undefined): TeammateRole[] {
  const kept = held.filter((r) => checked.has(r));
  const added = teammateRole.options.filter((r) => checked.has(r) && !held.includes(r));
  const ordered = [...kept, ...added];
  const first = main !== undefined && checked.has(main) ? main : ordered[0];
  return first === undefined ? [] : [first, ...ordered.filter((r) => r !== first)];
}

/**
 * What a person's roles editor shows when the roles it was showing (`was`)
 * become `now`, after a save or someone else's change. A draft with no
 * unsaved change follows the new roles. An unsaved change is kept rather than
 * lost, with a notice naming the roles the person now holds; saving it then
 * replaces those, knowingly, and Undo shows them.
 */
export function followHeldRoles(
  person: HumanTeammate,
  was: readonly TeammateRole[],
  now: readonly TeammateRole[],
  draft: readonly TeammateRole[],
): { draft: TeammateRole[]; notice: string | undefined } {
  if (sameRoles(was, now)) return { draft: [...draft], notice: undefined };
  if (sameRoles(draft, was) || sameRoles(draft, now)) return { draft: [...now], notice: undefined };
  const list = now.map((r) => roleTitle[r]).join(", ");
  return {
    draft: [...draft],
    notice: `Someone changed ${person.name}'s roles meanwhile; they now hold ${list}. Your unsaved change is kept: Save replaces theirs, Undo shows them.`,
  };
}

/** What the add form holds. An empty `id` means the id the name suggests. */
export interface AddForm {
  name: string;
  id: string;
  roles: TeammateRole[];
}

export const emptyAddForm: AddForm = { name: "", id: "", roles: [] };

/** The id the person will be added with: the one typed, or else the one the name suggests. */
export function addFormId(form: AddForm): string {
  const typed = form.id.trim();
  return typed === "" ? teammateIdFromName(form.name) : typed;
}

export interface AddFormProblems {
  name?: string;
  id?: string;
  roles?: string;
}

/**
 * Why the add form cannot be sent yet, per field: no name, no id the API
 * would accept, an id a person on the team holds, or no role. The API checks
 * the same, and also refuses an AI teammate's id, and answers with its own
 * reason if the team has changed meanwhile.
 */
export function addFormProblems(form: AddForm, team: TeamResponse): AddFormProblems {
  const problems: AddFormProblems = {};
  if (form.name.trim() === "") problems.name = "Give the person's name.";
  const id = addFormId(form);
  if (id === "") {
    if (form.name.trim() !== "") problems.id = "The name suggests no id; type one, such as anna-berg.";
  } else if (!newTeammateId.safeParse(id).success) {
    problems.id = "An id is lower-case letters and digits, in words joined by single hyphens, at most 40 characters.";
  } else if (team.people.some((p) => p.teammate.id === id)) {
    problems.id = `There is already a teammate '${id}'; choose another id.`;
  }
  if (form.roles.length === 0) problems.roles = "Choose at least one role.";
  return problems;
}

export function hasProblems(problems: AddFormProblems): boolean {
  return Object.keys(problems).length > 0;
}

/**
 * The request for a form with no problems. The actor is the person chosen
 * under "Changing as", or the new person on a team with no person yet.
 */
export function addRequest(form: AddForm, actor: string | undefined): AddTeammateRequest {
  const id = addFormId(form);
  return { actor: actor ?? id, id, name: form.name.trim(), roles: [...form.roles] };
}

/** Why adding a person failed, for "Not added: …". */
export function addFailure(err: unknown): string {
  if (err instanceof ApiRequestError) return err.reason;
  return "the person could not be added";
}

/** The request that takes a person off the team, as the person chosen under "Changing as". */
export function leaveRequest(actor: string): LeaveTeamRequest {
  return { actor };
}

/**
 * What the screen asks before taking a person off the team, naming who it is
 * recorded as. Nothing is deleted, but the id cannot be used again, so the
 * question says both.
 */
export function leaveQuestion(person: HumanTeammate, actor: string, team: TeamResponse): string {
  const as = actor === person.id ? `${person.name} themselves` : (team.people.find((p) => p.teammate.id === actor)?.teammate.name ?? actor);
  return `Take ${person.name} off the team, recorded as made by ${as}? Their cards and log entries stay and keep their name; the id ${person.id} cannot be used again.`;
}

/**
 * Why taking a person off the team failed, for "Not taken off: …". The API's
 * reason names what to do first, such as the cards the person still owns or
 * the question waiting on them. A 409 means someone took them off first.
 */
export function leaveFailure(err: unknown, person: HumanTeammate): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "conflict") return `someone took ${person.name} off the team in the meantime`;
    return err.reason;
  }
  return `${person.name} could not be taken off the team`;
}

/** Why a roles change failed, for "Not saved: …". A 409 means someone changed the roles first. */
export function rolesFailure(err: unknown, person: HumanTeammate): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "conflict") return `someone changed ${person.name}'s roles in the meantime`;
    return err.reason;
  }
  return "the roles could not be saved";
}
