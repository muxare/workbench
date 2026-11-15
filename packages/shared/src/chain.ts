// A person's chain of functions and the mode they work each one in, shared by
// the API (the teammate profile, the AI's eligibility, a pick) and the board
// (the mode counts on a teammate's panel), so the two can never count
// differently. Everything about a function is read from its file in
// process/functions; these rules only need its name, role and default mode.
import { z } from "zod";
import { functionId, mode, type HumanTeammate, type Mode, type Teammate } from "./domain.ts";
import { functionRole, type ProtocolActor } from "./functionFile.ts";

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

/**
 * The part of a function's front matter that says who writes in each mode,
 * which is who may move a card of that function along its work.
 * `FunctionFrontMatter` fits it as it is.
 */
export type MoveFunction = ChainFunction & { protocols: Partial<Record<Mode, { writes: ProtocolActor }>> };

/** Whether `mover` may move a card owned by `owner`, and if not, why. */
export type MoveVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Who may move a card along its work (to review, and the AI back to in
 * progress on changes requested; a person's send-back is `maySendCardBack`):
 * the one who writes in the protocol of the owner's mode
 * for the card's function (docs/decisions.md, 2026-11-11). The owner may
 * always move their own card. The AI may move it only when that protocol's
 * `writes` is `ai` or `both`, which in every function file today is
 * `delegate`. Nobody else may: in `manual` and `assist` the person writes,
 * and the person is the card's owner. A card owned by an AI teammate has no
 * mode, so only that teammate moves it. The protocol is read from the
 * function's file, never assumed from the mode's name.
 *
 * `pickedMode` is the mode recorded on the card's `picked` event, when it has
 * one: the card is worked in the mode it was picked in, so a profile change
 * after the pick does not change who may move it. Without it the owner's
 * current mode applies.
 */
export function mayMoveCard(mover: Teammate, owner: Teammate, definition: MoveFunction, pickedMode?: Mode): MoveVerdict {
  if (mover.id === owner.id) return { allowed: true };
  if (owner.kind !== "human") {
    return { allowed: false, reason: `${owner.id} is an AI teammate with no mode, so only ${owner.id} moves its card` };
  }
  const m = pickedMode ?? ownerMode(owner, definition);
  const writes = definition.protocols[m]?.writes;
  if (mover.kind === "ai" && (writes === "ai" || writes === "both")) return { allowed: true };
  const writer = writes === undefined ? `${definition.name} has no protocol for ${m}` : `${writes} writes`;
  const how = pickedMode === undefined ? `${owner.id} works ${definition.name} in ${m}` : `the card was picked in ${m}`;
  return {
    allowed: false,
    reason: `${how}, where ${writer}, so only ${owner.id}${
      writes === "ai" || writes === "both" ? " or the AI" : ""
    } may move the card, not ${mover.id}`,
  };
}

/**
 * Who may send a card back from review to in progress on changes requested.
 * Any person may, whatever the mode and whoever owns the card, because a
 * reviewer is rarely the owner (docs/decisions.md, 2026-11-12). The AI is
 * held to `mayMoveCard`, as for every other move. The move to review is not
 * widened: it stays with `mayMoveCard`.
 */
export function maySendCardBack(mover: Teammate, owner: Teammate, definition: MoveFunction, pickedMode?: Mode): MoveVerdict {
  if (mover.kind === "human") return { allowed: true };
  return mayMoveCard(mover, owner, definition, pickedMode);
}
