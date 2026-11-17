// A person's teammate profile: their chain of steps, each with the mode they
// work it in. Every field of a step except the person's own choice is read
// from the function's file in process/functions, so a changed file shows up
// on the profile without a code change. Each step also carries the team's
// critic gate for the function, so the profile can show and change it.
import {
  chainOf,
  criticRequired,
  ownerMode,
  type CriticGates,
  type FunctionFrontMatter,
  type HumanTeammate,
  type ProfileStep,
  type TeammateProfileResponse,
} from "@workbench/shared";
import { workableMode } from "./teammates/eligibility.ts";

function step(person: HumanTeammate, definition: FunctionFrontMatter, gates: CriticGates): ProfileStep {
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
    critic_required: criticRequired(gates, definition.name),
  };
}

/**
 * The profile of `person`: their chain (`chainOf` in packages/shared, which
 * the board's mode counts use too), each step with its mode and the critic
 * gate in `gates` (from `criticGates` in the store; a function not in it is off).
 * A profile entry with no function file is listed in `unknown_functions`.
 */
export function buildProfile(
  person: HumanTeammate,
  definitions: ReadonlyMap<string, FunctionFrontMatter>,
  gates: CriticGates,
): TeammateProfileResponse {
  return {
    teammate: person,
    steps: chainOf(person, definitions.values()).map((d) => step(person, d, gates)),
    unknown_functions: Object.keys(person.process_profile).filter((id) => !definitions.has(id)),
  };
}
