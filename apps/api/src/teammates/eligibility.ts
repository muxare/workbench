// Which cards the AI teammate may pick, decided from the card's function
// definition in process/ and its owner's process profile. Nothing here names
// a function or copies a protocol; the only fixed facts are the board status a
// card is picked from and the modes this teammate knows how to work in.
import { unfinishedDependencies, type Card, type CardEvent, type FunctionFrontMatter, type Mode, type Protocol, type Teammate } from "@workbench/shared";

/**
 * The modes this AI teammate works in. It only assists for now: in `assist`
 * the person writes and the AI asks. `delegate` (the AI drafts) is not built.
 * This is the teammate's own capability, not a function field; whether a mode
 * is allowed for a step is read from the function file.
 */
export const TEAMMATE_MODES: readonly Mode[] = ["assist"];

/** Protocol values under which the AI may ask questions. */
const AI_ASKS = new Set(["ai", "both"]);

export type HumanTeammate = Extract<Teammate, { kind: "human" }>;

export type Eligibility =
  | { eligible: true; card: Card; definition: FunctionFrontMatter; mode: Mode; protocol: Protocol; owner: HumanTeammate }
  | { eligible: false; card: Card; reason: string };

/** The mode `owner` works `definition` in: their choice, or the function's `modes.default`. */
export function ownerMode(owner: HumanTeammate, definition: FunctionFrontMatter): Mode {
  return owner.process_profile[definition.name] ?? definition.modes.default;
}

/**
 * Whether this AI teammate can work a step of `definition` in `mode`, before
 * looking at any card: rules 3 to 5 below. The teammate profile uses it to say
 * on which steps the AI may pick on its own.
 */
export function workableMode(
  definition: FunctionFrontMatter,
  mode: Mode,
): { ok: true; protocol: Protocol } | { ok: false; reason: string } {
  const refuse = (reason: string) => ({ ok: false as const, reason });
  if (!definition.modes.allowed.includes(mode)) {
    return refuse(`mode '${mode}' is not in ${definition.name}'s modes.allowed (${definition.modes.allowed.join(", ")})`);
  }
  if (!TEAMMATE_MODES.includes(mode)) {
    return refuse(`the owner works ${definition.name} in '${mode}'; this teammate works only in ${TEAMMATE_MODES.join(", ")}`);
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
 * 1. The card is in Ready, and every card it depends on is done.
 * 2. Its function exists in process/ and its owner is a human teammate.
 * 3. The mode is the owner's choice for the function, or the function's
 *    `modes.default` when the owner has not chosen one, and that mode is in
 *    the function's `modes.allowed`.
 * 4. The mode is one this teammate works in (TEAMMATE_MODES).
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
): Eligibility {
  const refuse = (reason: string): Eligibility => ({ eligible: false, card, reason: `${card.id}: ${reason}` });

  if (card.status.state !== "ready") return refuse(`card is ${card.status.state}, not ready`);
  const blockers = unfinishedDependencies(card, cards);
  if (blockers.length > 0) return refuse(`depends on ${blockers.join(", ")}, which is not done`);

  const definition = definitions.get(card.function_id);
  if (!definition) return refuse(`no function '${card.function_id}' in process/functions`);

  const owner = teammates.find((t) => t.id === card.owner);
  if (owner?.kind !== "human") return refuse(`owner ${card.owner} is not a human teammate`);

  const mode = ownerMode(owner, definition);
  const work = workableMode(definition, mode);
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
