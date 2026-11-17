// The team screen's view-model: pure functions over `GET /api/team`. The steps
// come from the function files in process/ and each cell from the person's
// profile, both through the API; nothing here names a function or decides
// whether the AI may pick.
import { SESSION_MODES } from "@workbench/shared";
import type { BoardResponse, HumanTeammate, Mode, TeamResponse, TeamStep } from "@workbench/shared";
import { modeLabel, modeMeaning } from "../board/modes.ts";
import { roleTitle, shortLabel } from "../board/teammates.ts";
import { teammateHref } from "../route.ts";

export type TeamState =
  | { phase: "loading" }
  | { phase: "error"; reason: string; retry: () => void }
  | { phase: "ready"; team: TeamResponse };

/**
 * What the screen shows: `empty` when there is no person or no step to set
 * against each other, so the table would have no cell.
 */
export type TeamScreen = "loading" | "error" | "empty" | "table";

export function teamScreen(state: TeamState): TeamScreen {
  if (state.phase !== "ready") return state.phase;
  return state.team.people.length === 0 || state.team.steps.length === 0 ? "empty" : "table";
}

/** Why the team is empty, in a sentence for the screen. */
export function emptyReason(team: TeamResponse): string {
  if (team.steps.length === 0) return "process/functions holds no function file, so there is no step to show.";
  return "The team has no person yet. AI teammates have no modes of their own, so they have no row here.";
}

/** A person's column heading. */
export interface TeamColumn {
  id: string;
  label: string;
  name: string;
  roles: string;
  href: string;
}

/** One person's cell on one step. Every cell links to the person's profile, where the mode is set. */
export type TeamCellView =
  | {
      kind: "mode";
      personId: string;
      href: string;
      mode: Mode;
      label: string;
      isDefault: boolean;
      aiMayPick: boolean;
      /**
       * The AI does not pick it on its own, but takes it when a person starts it
       * in an agent session or hands it over in a batch (`SESSION_MODES`).
       */
      aiOnHandOff: boolean;
      /** The cell's accessible name and tooltip, in a sentence. */
      description: string;
    }
  | { kind: "none"; personId: string; href: string; description: string };

export interface TeamRow {
  step: TeamStep;
  cells: TeamCellView[];
}

export function teamColumns(team: TeamResponse): TeamColumn[] {
  return team.people.map(({ teammate }) => column(teammate));
}

function column(person: HumanTeammate): TeamColumn {
  return {
    id: person.id,
    label: shortLabel(person, person.id),
    name: person.name,
    roles: person.roles.map((r) => roleTitle[r]).join(" · "),
    href: teammateHref(person.id),
  };
}

/**
 * One row per step, in the order the API sends (process/functions file
 * order), with one cell per person in column order. A step outside a
 * person's chain has a `none` cell.
 */
export function teamRows(team: TeamResponse): TeamRow[] {
  return team.steps.map((step) => ({
    step,
    cells: team.people.map(({ teammate, cells }) => {
      const href = teammateHref(teammate.id);
      const cell = cells.find((c) => c.function_id === step.function_id);
      if (!cell) {
        return { kind: "none", personId: teammate.id, href, description: `${teammate.name}: ${step.title} is not in their chain.` };
      }
      const how = `${modeMeaning[cell.mode]}${cell.mode_is_default ? " (the step's default)" : ""}`;
      const aiOnHandOff = !cell.ai_may_pick && SESSION_MODES.includes(cell.mode);
      const ai = cell.ai_may_pick
        ? "The AI may pick a Ready card on it on its own."
        : aiOnHandOff
          ? "The AI does not pick it on its own, but takes it when a person hands it over, in a session or a batch."
          : "The AI does not pick it on its own.";
      return {
        kind: "mode",
        personId: teammate.id,
        href,
        mode: cell.mode,
        label: modeLabel[cell.mode],
        isDefault: cell.mode_is_default,
        aiMayPick: cell.ai_may_pick,
        aiOnHandOff,
        description: `${teammate.name}, ${step.title}: ${how}. ${ai}`,
      };
    }),
  }));
}

/**
 * How many steps the AI may pick on its own for at least one person, of the
 * steps anyone works (those in at least one person's chain).
 */
export function aiPickCount(team: TeamResponse): { may: number; total: number } {
  const all = team.people.flatMap((p) => p.cells);
  const worked = new Set(all.map((c) => c.function_id));
  const may = new Set(all.filter((c) => c.ai_may_pick).map((c) => c.function_id));
  return { may: may.size, total: worked.size };
}

/**
 * Keeps out-of-order answers from overwriting newer ones: each request takes a
 * ticket with `start`, and `settle` says whether its answer may be shown,
 * which is only when no later request has been shown already.
 */
export function responseOrder(): { start: () => number; settle: (ticket: number) => boolean } {
  let issued = 0;
  let shown = 0;
  return {
    start: () => (issued += 1),
    settle: (ticket) => {
      if (ticket <= shown) return false;
      shown = ticket;
      return true;
    },
  };
}

/**
 * The id of the latest event in the board's log that changes the team
 * screen: a `mode_changed` or `roles_changed` about anyone. "" when the log
 * holds none, and undefined while there is no board. Follow it with
 * `followLiveKey`, as a profile does.
 */
export function teamLiveKey(board: BoardResponse | undefined): string | undefined {
  if (!board) return undefined;
  for (let i = board.log.length - 1; i >= 0; i -= 1) {
    const e = board.log[i]!;
    if (e.type === "mode_changed" || e.type === "roles_changed") return e.id;
  }
  return "";
}
