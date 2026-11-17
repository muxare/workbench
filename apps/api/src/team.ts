// The team screen's data: every person against every step. Each person's
// cells are their profile's steps (buildProfile), so the mode, the default and
// whether the AI may pick come from the same code as their profile. The steps
// are the function files in process/functions, in file order.
import type { FunctionFrontMatter, HumanTeammate, Teammate, TeamResponse } from "@workbench/shared";
import { buildProfile } from "./profile.ts";

/** `GET /team`: every function as a step, and every person with a cell for each step of their chain. */
export function buildTeam(teammates: readonly Teammate[], definitions: ReadonlyMap<string, FunctionFrontMatter>): TeamResponse {
  const people = teammates.filter((t): t is HumanTeammate => t.kind === "human");
  return {
    steps: [...definitions.values()].map((d) => ({ function_id: d.name, role: d.role, title: d.title, summary: d.summary })),
    people: people.map((person) => ({
      teammate: person,
      // The cells leave out the critic gate, so the profile is built without the team's gates.
      cells: buildProfile(person, definitions, {}).steps.map((s) => ({
        function_id: s.function_id,
        mode: s.mode,
        mode_is_default: s.mode_is_default,
        ai_may_pick: s.ai_may_pick,
      })),
    })),
  };
}
