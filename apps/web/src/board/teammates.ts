// Who is who on the board: short labels, where each teammate sits around the
// board, and each teammate's mode counts. Pure functions over the API data.
// A person may hold several roles; the first is their main role, which seats
// them and names them in avatars, lines and logs, and their panel lists the
// others.
import {
  chainModeCounts,
  teammateRole,
  type BoardResponse,
  type ChainFunction,
  type ExternalSource,
  type HumanTeammate,
  type Mode,
  type Question,
  type Teammate,
  type TeammateRole,
  type WaitingOn,
} from "@workbench/shared";
import { modes } from "./modes.ts";

/** A role as the artboard names it in a teammate's panel. */
export const roleTitle: Record<TeammateRole, string> = {
  po: "Product owner",
  ux: "UX designer",
  fe: "Frontend developer",
  be: "Backend developer",
};

/**
 * The sub-line of a panel whose role owns no chain of functions, in place of
 * mode counts. On the artboard only the product owner has one.
 */
export const roleSummary: Partial<Record<TeammateRole, string>> = {
  po: "Owns the order and the milestone.",
};

/** A person's main role: the first they hold. The API never sends a person without one. */
export function mainRole(person: HumanTeammate): TeammateRole {
  return person.roles[0]!;
}

/** A person's roles in capitals, in their order: "PO · UX · FE · BE". */
export function rolesLabel(person: HumanTeammate): string {
  return person.roles.map((r) => r.toUpperCase()).join(" · ");
}

/** The panel line naming a person's other roles, "Also UX · FE · BE", or nothing when they hold one. */
export function otherRolesLine(teammate: Teammate): string | undefined {
  if (teammate.kind !== "human" || teammate.roles.length < 2) return undefined;
  return `Also ${teammate.roles
    .slice(1)
    .map((r) => r.toUpperCase())
    .join(" · ")}`;
}

/**
 * The line under a panel's heading when it is not the person's mode counts:
 * the AI teammate's one-line description, or the main role's summary when
 * none of the person's roles owns a chain of functions. A product owner who
 * also develops gets mode counts, since they work steps of their own.
 */
export function panelSubline(teammate: Teammate): string | undefined {
  if (teammate.kind === "ai") return "Works in the mode each person set for the step.";
  if (!teammate.roles.every((r) => roleSummary[r] !== undefined)) return undefined;
  return roleSummary[mainRole(teammate)];
}

/** The panel heading: a person's main role, or an AI teammate's name. */
export function panelTitle(teammate: Teammate): string {
  return teammate.kind === "human" ? roleTitle[mainRole(teammate)] : teammate.name;
}

/**
 * The two-letter label in an avatar and in the lines and log: a person's main
 * role ("PO", "UX", "FE", "BE"), and "AI" for an AI teammate. Two people with
 * the same main role share a label; their names stay in the avatar's tooltip.
 * An unknown id is shown as it is.
 */
export function shortLabel(teammate: Teammate | undefined, id: string): string {
  if (!teammate) return id;
  if (teammate.kind === "ai") return "AI";
  return mainRole(teammate).toUpperCase();
}

export function findTeammate(board: BoardResponse, id: string): Teammate | undefined {
  return board.teammates.find((t) => t.id === id);
}

export function labelOf(board: BoardResponse, id: string): string {
  return shortLabel(findTeammate(board, id), id);
}

/** An external source as the board names it: "domain_rules (caretaker's fault records)". */
export function externalLabel(external: ExternalSource): string {
  return `${external.artifact} (${external.source})`;
}

/**
 * Who or what a card waits on, in the board's words: a teammate's label
 * ("BE"), or an external source and the person relaying to it
 * ("domain_rules (caretaker's fault records), relayed by PO").
 */
export function waitingOnLabel(board: BoardResponse, w: WaitingOn): string {
  return typeof w === "string" ? labelOf(board, w) : `${externalLabel(w)}, relayed by ${labelOf(board, w.relayed_by)}`;
}

/** Who or what an open question waits on, in the same words as `waitingOnLabel`. */
export function questionWaitLabel(board: BoardResponse, q: Question): string {
  return waitingOnLabel(board, q.external ? { ...q.external, relayed_by: q.asked_of } : q.asked_of);
}

/** The first AI teammate, who assists or drafts on cards in `assist` and `delegate`. */
export function aiTeammate(board: BoardResponse): Teammate | undefined {
  return board.teammates.find((t) => t.kind === "ai");
}

/**
 * A card id as the board shows it: "#142" when the id ends in a number, the
 * whole id otherwise. The full id stays available as a tooltip.
 */
export function cardRef(id: string): string {
  const match = /(\d+)$/.exec(id);
  return match ? `#${match[1]}` : id;
}

export interface Placement {
  top: Teammate[];
  left: Teammate[];
  right: Teammate[];
  bottom: Teammate[];
}

/**
 * The seat for each role, as on the Main artboard: the product owner above the
 * board, UX to the left, frontend and backend to the right. Seats fill in the
 * order of `teammateRole` (po, ux, fe, be), so the right reads FE above BE.
 */
const seatOf: Record<TeammateRole, Exclude<keyof Placement, "bottom">> = {
  po: "top",
  ux: "left",
  fe: "right",
  be: "right",
};

/**
 * Where teammates sit around the board: each person once, at the seat of
 * their main role, and AI teammates under the board. People who share a main
 * role sit together in the API's order.
 */
export function placeTeammates(teammates: readonly Teammate[]): Placement {
  const placement: Placement = { top: [], left: [], right: [], bottom: [] };
  for (const role of teammateRole.options) {
    placement[seatOf[role]].push(...teammates.filter((t) => t.kind === "human" && mainRole(t) === role));
  }
  placement.bottom.push(...teammates.filter((t) => t.kind === "ai"));
  return placement;
}

/**
 * How many steps of a person's chain they work in each mode: every function of
 * their roles and every other function they chose a mode for, each in their
 * mode or else the function's default. The same rule (`chainModeCounts` in
 * packages/shared) as the profile's steps, over the functions the board sent,
 * so a streamed `mode_changed` or `roles_changed` folded into the teammate
 * changes the counts at once.
 */
export function modeCounts(teammate: Teammate, functions: readonly ChainFunction[]): { mode: Mode; count: number }[] {
  if (teammate.kind !== "human") return [];
  const counts = chainModeCounts(teammate, functions);
  return modes.map((m) => ({ mode: m, count: counts[m] }));
}
