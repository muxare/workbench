// What a log's filter control says and does, as pure functions over the board.
// The event types it offers come from the shared schema (`logEventTypes`), so
// a new event type appears here, shown, with no change to this file.
import {
  logEventTypes,
  normalizeEventTypes,
  sameEventTypes,
  type BoardResponse,
  type HumanTeammate,
  type LogName,
  type StreamEventType,
} from "@workbench/shared";
import { ApiRequestError } from "../api/client.ts";

export interface FilterOption {
  type: StreamEventType;
  shown: boolean;
}

/**
 * Every event type the log can hold, each marked shown unless the filter
 * hides it. `offered` narrows the list where a screen shows only part of a
 * log, such as the AI profile, whose teammate log holds only card events.
 */
export function filterOptions(
  log: LogName,
  hidden: readonly StreamEventType[],
  offered: readonly StreamEventType[] = logEventTypes(log),
): FilterOption[] {
  const set = new Set(hidden);
  return offered.map((type) => ({ type, shown: !set.has(type) }));
}

/** The hidden set after showing or hiding one event type, in schema order. */
export function toggleHidden(hidden: readonly StreamEventType[], type: StreamEventType, shown: boolean): StreamEventType[] {
  return normalizeEventTypes(shown ? hidden.filter((t) => t !== type) : [...hidden, type]);
}

/**
 * The control's closed label: "All events" while the filter hides nothing the
 * log can hold, else "Hiding 2 of 7".
 */
export function filterSummary(
  log: LogName,
  hidden: readonly StreamEventType[],
  offered: readonly StreamEventType[] = logEventTypes(log),
): string {
  const options = filterOptions(log, hidden, offered);
  const hiddenCount = options.filter((o) => !o.shown).length;
  return hiddenCount === 0 ? "All events" : `Hiding ${hiddenCount} of ${options.length}`;
}

/**
 * What the control shows once a save answers: the saved filter, but only
 * while the board still shows the filter the change was made from. If the
 * board has moved on (the change already streamed in, or someone else's came
 * after it), the board is newer than the answer and is shown instead.
 */
export function shownAfterSave(
  madeFrom: readonly StreamEventType[],
  boardNow: readonly StreamEventType[],
  saved: readonly StreamEventType[],
): StreamEventType[] | undefined {
  return sameEventTypes(madeFrom, boardNow) ? [...saved] : undefined;
}

/** Why a save failed, for "Not saved: …". A 409 means someone changed the filter first. */
export function saveFailure(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.code === "conflict" ? "someone changed this filter in the meantime; try again" : err.reason;
  }
  return "the filter could not be saved";
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
  return (people.find((p) => p.roles.includes("po")) ?? people[0])?.id;
}
