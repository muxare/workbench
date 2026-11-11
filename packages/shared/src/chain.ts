// A person's chain of functions and the mode they work each one in, shared by
// the API (the teammate profile, the AI's eligibility, a pick) and the board
// (the mode counts on a teammate's panel), so the two can never count
// differently. Everything about a function is read from its file in
// process/functions; these rules only need its name, role and default mode.
import { z } from "zod";
import { functionId, mode, type HumanTeammate, type Mode } from "./domain.ts";
import { functionRole } from "./functionFile.ts";

/**
 * The part of a function's front matter that decides who works it and in
 * which mode when they have not chosen one. `GET /board` sends one per
 * function file, in file order; `FunctionFrontMatter` fits it as it is.
 */
export const chainFunction = z.object({
  name: functionId,
  role: functionRole,
  modes: z.object({ default: mode }),
});
export type ChainFunction = z.infer<typeof chainFunction>;

/** The mode `person` works `definition` in: their choice, or the function's `modes.default`. */
export function ownerMode(person: HumanTeammate, definition: ChainFunction): Mode {
  return person.process_profile[definition.name] ?? definition.modes.default;
}

/**
 * A person's chain: every function whose `role` is one of theirs, in the
 * order given, then every other function they have a mode for in their
 * process profile, in the same order. A profile entry naming no known
 * function is not part of the chain.
 */
export function chainOf<F extends ChainFunction>(person: HumanTeammate, definitions: Iterable<F>): F[] {
  const all = [...definitions];
  const roles = new Set<string>(person.roles);
  const own = all.filter((d) => roles.has(d.role));
  const chosen = all.filter((d) => !roles.has(d.role) && person.process_profile[d.name] !== undefined);
  return [...own, ...chosen];
}

/** How many steps of the person's chain they work in each mode, every mode listed, zeros included. */
export function chainModeCounts(person: HumanTeammate, definitions: Iterable<ChainFunction>): Record<Mode, number> {
  const counts = Object.fromEntries(mode.options.map((m) => [m, 0])) as Record<Mode, number>;
  for (const d of chainOf(person, definitions)) counts[ownerMode(person, d)] += 1;
  return counts;
}
