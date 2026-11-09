// Who is who on the board: short labels, where each teammate sits around the
// board, and each teammate's mode counts. Pure functions over the API data.
import type { BoardResponse, Teammate } from "@workbench/shared";
import { modes } from "./modes.ts";
import type { Mode } from "@workbench/shared";

/**
 * The two-letter label in an avatar. The API has no role field, so a person
 * gets the initials of their name (any parenthetical dropped) and an AI
 * teammate is "AI". An unknown id is shown as it is.
 */
export function shortLabel(teammate: Teammate | undefined, id: string): string {
  if (!teammate) return id;
  if (teammate.kind === "ai") return "AI";
  const words = teammate.name
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const initials = words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return initials || teammate.id;
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
 * Where teammates sit around the board, as on the artboard: AI teammates under
 * the board, the first person above it, and the rest split between the left
 * (the first half, rounded down) and the right. The order is the API's.
 */
export function placeTeammates(teammates: readonly Teammate[]): Placement {
  const people = teammates.filter((t) => t.kind === "human");
  const ais = teammates.filter((t) => t.kind === "ai");
  const [first, ...rest] = people;
  const half = Math.floor(rest.length / 2);
  return {
    top: first ? [first] : [],
    left: rest.slice(0, half),
    right: rest.slice(half),
    bottom: ais,
  };
}

/** How many of a person's functions they work in each mode, from their process profile. */
export function modeCounts(teammate: Teammate): { mode: Mode; count: number }[] {
  if (teammate.kind !== "human") return [];
  const values = Object.values(teammate.process_profile);
  return modes.map((m) => ({ mode: m, count: values.filter((v) => v === m).length }));
}
