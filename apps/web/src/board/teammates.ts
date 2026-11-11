// Who is who on the board: short labels, where each teammate sits around the
// board, and each teammate's mode counts. Pure functions over the API data.
// A person may hold several roles; the first is their main role, which seats
// them and names them in avatars, lines and logs, and their panel lists the
// others.
import {
  teammateRole,
  type BoardResponse,
  type HumanTeammate,
  type Mode,
  type Teammate,
  type TeammateRole,
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

/** How many of a person's functions they work in each mode, from their process profile. */
export function modeCounts(teammate: Teammate): { mode: Mode; count: number }[] {
  if (teammate.kind !== "human") return [];
  const values = Object.values(teammate.process_profile);
  return modes.map((m) => ({ mode: m, count: values.filter((v) => v === m).length }));
}
