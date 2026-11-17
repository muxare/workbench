// Which cards the AI teammate may pick, decided from the card's function
// definition in process/ and its owner's process profile. Nothing here names
// a function or copies a protocol; the only fixed facts are the board status a
// card is picked from and the modes this teammate knows how to work in.
// Pure, with no database, so the API, its runner and the MCP server (apps/mcp)
// decide by the same rules; apps/api/src/teammates/eligibility.ts re-exports it.
import { unmetDependencies, type Batch } from "./batch.ts";
import { ownerMode } from "./chain.ts";
import type { Card, CardEvent, HumanTeammate, Mode, Teammate } from "./domain.ts";
import type { FunctionFrontMatter, Protocol } from "./functionFile.ts";

/**
 * The modes this AI teammate works in when its runner picks on its own. It
 * only assists for now: in `assist` the person writes and the AI asks.
 * `delegate` (the AI drafts) is not built there. This is the teammate's own
 * capability, not a function field; whether a mode is allowed for a step is
 * read from the function file.
 */
export const TEAMMATE_MODES: readonly Mode[] = ["assist"];

/** Protocol values under which the AI may ask questions. */
const AI_ASKS = new Set(["ai", "both"]);

export type Eligibility =
  | { eligible: true; card: Card; definition: FunctionFrontMatter; mode: Mode; protocol: Protocol; owner: HumanTeammate }
  | { eligible: false; card: Card; reason: string };

/**
 * Whether this AI teammate can work a step of `definition` in `mode`, before
 * looking at any card: rules 3 to 5 below. The teammate profile uses it to say
 * on which steps the AI may pick on its own.
 */
export function workableMode(
  definition: FunctionFrontMatter,
  mode: Mode,
  modes: readonly Mode[] = TEAMMATE_MODES,
): { ok: true; protocol: Protocol } | { ok: false; reason: string } {
  const refuse = (reason: string) => ({ ok: false as const, reason });
  if (!definition.modes.allowed.includes(mode)) {
    return refuse(`mode '${mode}' is not in ${definition.name}'s modes.allowed (${definition.modes.allowed.join(", ")})`);
  }
  if (!modes.includes(mode)) {
    return refuse(`the owner works ${definition.name} in '${mode}'; this teammate works only in ${modes.join(", ")}`);
  }
  const protocol = definition.protocols[mode];
  if (!protocol) return refuse(`${definition.name} has no protocol for '${mode}'`);
  if (!AI_ASKS.has(protocol.asks)) return refuse(`in ${definition.name}/${mode}, asks is '${protocol.asks}', so the AI may not ask`);
  if (protocol.decides !== "human") return refuse(`in ${definition.name}/${mode}, decides is not human`);
  return { ok: true, protocol };
}

/**
 * Decide whether the AI teammate may pick `card`:
 *
 * 1. The card is in Ready, and every card it depends on is done, or is in
 *    an earlier wave of an open planned batch in `batches` that holds the
 *    card too (`unmetDependencies`). `batches` are the batches handed to
 *    this teammate.
 * 2. Its function exists in process/ and its owner is a human teammate.
 * 3. The mode is the owner's choice for the function, or the function's
 *    `modes.default` when the owner has not chosen one, and that mode is in
 *    the function's `modes.allowed`.
 * 4. The mode is one this teammate works in: `modes`, which is
 *    TEAMMATE_MODES for the runner and SESSION_MODES for a pick from an agent
 *    session.
 * 5. The mode's protocol lets the AI ask (`asks` is `ai` or `both`) and is
 *    decided by a human.
 * 6. If the protocol's `opens` is `human`, the card was moved into Ready by a
 *    human, so a person opened the work before the AI joins it.
 */
export function checkEligibility(
  card: Card,
  log: readonly CardEvent[],
  definitions: ReadonlyMap<string, FunctionFrontMatter>,
  teammates: readonly Teammate[],
  cards: readonly Card[],
  modes: readonly Mode[] = TEAMMATE_MODES,
  batches: readonly Batch[] = [],
): Eligibility {
  const refuse = (reason: string): Eligibility => ({ eligible: false, card, reason: `${card.id}: ${reason}` });

  if (card.withdrawn) return refuse("card was withdrawn");
  if (card.status.state !== "ready") return refuse(`card is ${card.status.state}, not ready`);
  const blockers = unmetDependencies(card, cards, batches);
  if (blockers.length > 0) return refuse(`depends on ${blockers.join(", ")}, which is not done`);

  const definition = definitions.get(card.function_id);
  if (!definition) return refuse(`no function '${card.function_id}' in process/functions`);

  const owner = teammates.find((t) => t.id === card.owner);
  if (owner?.kind !== "human") return refuse(`owner ${card.owner} is not a human teammate`);

  const mode = ownerMode(owner, definition);
  const work = workableMode(definition, mode, modes);
  if (!work.ok) return refuse(work.reason);
  const { protocol } = work;

  if (protocol.opens === "human") {
    const opened = [...log].reverse().find((e) => e.type === "status_changed" && e.to.state === "ready");
    const opener = opened && teammates.find((t) => t.id === opened.actor);
    if (opener?.kind !== "human") {
      return refuse(`in ${definition.name}/${mode}, opens is human, but no human moved the card to ready`);
    }
  }

  return { eligible: true, card, definition, mode, protocol, owner };
}
