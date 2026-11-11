// A person's teammate profile: their chain of steps, each with the mode they
// work it in. Every field of a step except the person's own choice is read
// from the function's file in process/functions, so a changed file shows up
// on the profile without a code change.
import type { FunctionFrontMatter, HumanTeammate, ProfileStep, TeammateProfileResponse } from "@workbench/shared";
import { ownerMode, workableMode } from "./teammates/eligibility.ts";

function step(person: HumanTeammate, definition: FunctionFrontMatter): ProfileStep {
  const mode = ownerMode(person, definition);
  return {
    function_id: definition.name,
    role: definition.role,
    title: definition.title,
    summary: definition.summary,
    modes: { default: definition.modes.default, allowed: [...definition.modes.allowed] },
    mode,
    mode_is_default: person.process_profile[definition.name] === undefined,
    ai_may_pick: workableMode(definition, mode).ok,
  };
}

/**
 * A person's chain: every function whose `role` is one of theirs, in the
 * order of `definitions`, then every other function they have a mode for in
 * their process profile, in the same order. The AI teammate's profile uses the
 * same rule to say who owns a step.
 */
export function chainOf(person: HumanTeammate, definitions: ReadonlyMap<string, FunctionFrontMatter>): FunctionFrontMatter[] {
  const all = [...definitions.values()];
  const roles = new Set<string>(person.roles);
  const own = all.filter((d) => roles.has(d.role));
  const chosen = all.filter((d) => !roles.has(d.role) && person.process_profile[d.name] !== undefined);
  return [...own, ...chosen];
}

/**
 * The profile of `person`: their chain (`chainOf`), each step with its mode.
 * A profile entry with no function file is listed in `unknown_functions`.
 */
export function buildProfile(
  person: HumanTeammate,
  definitions: ReadonlyMap<string, FunctionFrontMatter>,
): TeammateProfileResponse {
  return {
    teammate: person,
    steps: chainOf(person, definitions).map((d) => step(person, d)),
    unknown_functions: Object.keys(person.process_profile).filter((id) => !definitions.has(id)),
  };
}
