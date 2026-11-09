// What a log's filter control says and does, as pure functions over the board.
// The event types it offers come from the shared schema (`logEventTypes`), so
// a new event type appears here, shown, with no change to this file.
import {
  logEventTypes,
  normalizeEventTypes,
  type BoardResponse,
  type HumanTeammate,
  type LogName,
  type StreamEventType,
} from "@workbench/shared";

export interface FilterOption {
  type: StreamEventType;
  shown: boolean;
}

/** Every event type the log can hold, each marked shown unless the filter hides it. */
export function filterOptions(log: LogName, hidden: readonly StreamEventType[]): FilterOption[] {
  const set = new Set(hidden);
  return logEventTypes(log).map((type) => ({ type, shown: !set.has(type) }));
}

/** The hidden set after showing or hiding one event type, in schema order. */
export function toggleHidden(hidden: readonly StreamEventType[], type: StreamEventType, shown: boolean): StreamEventType[] {
  return normalizeEventTypes(shown ? hidden.filter((t) => t !== type) : [...hidden, type]);
}

/**
 * The control's closed label: "All events" while the filter hides nothing the
 * log can hold, else "Hiding 2 of 7".
 */
export function filterSummary(log: LogName, hidden: readonly StreamEventType[]): string {
  const options = filterOptions(log, hidden);
  const hiddenCount = options.filter((o) => !o.shown).length;
  return hiddenCount === 0 ? "All events" : `Hiding ${hiddenCount} of ${options.length}`;
}

/** The people who may change a filter: every human teammate, in the board's order. */
export function filterEditors(board: BoardResponse): HumanTeammate[] {
  return board.teammates.filter((t): t is HumanTeammate => t.kind === "human");
}

/**
 * Who a filter change is made as until the viewer picks someone: the product
 * owner, who owns the order of the board, or else the first person. There is
 * no sign-in, so the control says who it changes the filter as.
 */
export function defaultFilterEditor(board: BoardResponse): string | undefined {
  const people = filterEditors(board);
  return (people.find((p) => p.role === "po") ?? people[0])?.id;
}
