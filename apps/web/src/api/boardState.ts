// The pure half of `useBoard`: how a streamed event and a refetched board are
// merged into the board the UI shows, and when a refetch starts. Card status
// is derived from events on the server, so this module never folds events
// into cards; it keeps the log current between refetches. A `mode_changed`
// event is folded into its teammate's process profile at once, as the server
// derives it, so the board's mode pills and counts follow it without a refetch.
// A `roles_changed` event replaces its teammate's roles in the same way, so the
// person moves seat and label at once; a person who joins appears on refetch.
// A `log_filter_changed` event replaces its log's filter at once in the same
// way, so a filter changed in another browser applies here as soon as it
// streams in. The filter only decides what a log shows; the log kept here
// holds every event, hidden or not. A `team_named` event renames the board at
// once. A `batch_handed` event adds its batch to the open batches at once and
// a `batch_planned` event adds the plan, so the batch markers follow without a
// refetch. As in `deriveBatches`, a card handed in a new batch, moved back
// to Backlog or withdrawn is released from the batch it was in; a batch's `finished` state depends on card status, which the
// refetch brings. A streamed event whose time falls in the
// current cycle's window joins the cycle log too; which cycle is current is
// the server's call, so a refetch brings a new cycle when one starts.
import { inCycle, streamEvent, type BoardResponse, type StreamEvent } from "@workbench/shared";

/** The API's `GET /board` log length (BOARD_LOG_LIMIT in apps/api/src/app.ts). */
export const BOARD_LOG_LIMIT = 50;

/** One message from `GET /api/events`: the event and its stream position (the SSE `id`). */
export interface LiveEvent {
  seq: number;
  event: StreamEvent;
}

/**
 * The board as shown, plus the streamed events that are newer than the last
 * fetched board. A refetch that started before those events arrived would
 * otherwise drop them from the log until the next refetch lands.
 */
export interface LiveBoard {
  board: BoardResponse;
  pending: readonly LiveEvent[];
}

export function liveBoard(board: BoardResponse): LiveBoard {
  return { board, pending: [] };
}

/**
 * Parse one SSE message: `data` is the event as JSON and `lastEventId` its
 * seq. Returns undefined for a message that is not a valid event.
 */
export function parseStreamMessage(data: string, lastEventId: string): LiveEvent | undefined {
  if (!/^\d+$/.test(lastEventId)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return undefined;
  }
  const parsed = streamEvent.safeParse(raw);
  return parsed.success ? { seq: Number(lastEventId), event: parsed.data } : undefined;
}

/**
 * The teammates with a `mode_changed` or `roles_changed` event applied: the
 * latest change for a function, or of the roles, wins.
 */
function applyToTeammates(teammates: BoardResponse["teammates"], e: StreamEvent): BoardResponse["teammates"] {
  if (e.type === "roles_changed") {
    return teammates.map((t) => (t.id === e.teammate_id && t.kind === "human" ? { ...t, roles: [...e.to] } : t));
  }
  if (e.type !== "mode_changed") return teammates;
  return teammates.map((t) =>
    t.id === e.teammate_id && t.kind === "human" ? { ...t, process_profile: { ...t.process_profile, [e.function_id]: e.to } } : t,
  );
}

/** The filters with a `log_filter_changed` event applied: the latest change for a log wins. */
function applyToFilters(filters: BoardResponse["log_filters"], e: StreamEvent): BoardResponse["log_filters"] {
  if (e.type !== "log_filter_changed") return filters;
  return { ...filters, [e.log]: e.hidden };
}

/** The open batches with a `batch_handed` or `batch_planned` event applied, as `deriveBatches` derives them. */
function applyToBatches(batches: BoardResponse["batches"], e: StreamEvent): BoardResponse["batches"] {
  const release = (list: BoardResponse["batches"], ids: readonly string[]) =>
    list.map((b) => {
      const add = ids.filter((id) => b.card_ids.includes(id) && !b.released_card_ids.includes(id));
      return add.length === 0 ? b : { ...b, released_card_ids: [...b.released_card_ids, ...add] };
    });
  if (e.type === "status_changed") return e.to.state === "backlog" ? release(batches, [e.card_id]) : batches;
  if (e.type === "card_withdrawn") return release(batches, [e.card_id]);
  if (e.type === "batch_handed") {
    if (batches.some((b) => b.id === e.batch_id)) return batches;
    return [
      ...release(batches, e.card_ids),
      {
        id: e.batch_id,
        card_ids: [...e.card_ids],
        released_card_ids: [],
        handed_to: e.handed_to,
        handed_by: e.actor,
        handed_at: e.at,
        state: "handed",
        plan: null,
      },
    ];
  }
  if (e.type !== "batch_planned") return batches;
  return batches.map((b) =>
    b.id === e.batch_id && b.plan === null
      ? {
          ...b,
          state: b.state === "finished" ? b.state : "planned",
          plan: { waves: e.waves.map((w) => ({ card_ids: [...w.card_ids], note: w.note })), planned_by: e.actor, planned_at: e.at },
        }
      : b,
  );
}

/** The cycle with the event added to its log, if its time falls in the window. */
function appendToCycle(current: BoardResponse["cycle"], e: StreamEvent): BoardResponse["cycle"] {
  if (current === null || !inCycle(current.cycle, e.at) || current.log.some((x) => x.id === e.id)) return current;
  return { ...current, log: [...current.log, e] };
}

function appendToBoard(board: BoardResponse, live: LiveEvent): BoardResponse {
  if (live.seq <= board.last_seq) return board;
  if (board.log.some((e) => e.id === live.event.id)) return { ...board, last_seq: live.seq };
  const log = [...board.log, live.event];
  return {
    ...board,
    teammates: applyToTeammates(board.teammates, live.event),
    log_filters: applyToFilters(board.log_filters, live.event),
    team: live.event.type === "team_named" ? live.event.to : board.team,
    batches: applyToBatches(board.batches, live.event),
    log: log.slice(-BOARD_LOG_LIMIT),
    cycle: appendToCycle(board.cycle, live.event),
    last_seq: live.seq,
  };
}

/**
 * Add a streamed event to the log. An event at or before the board's
 * `last_seq`, or one already in the log, is a duplicate (a replay after a
 * reconnect) and leaves the board as it was, by reference.
 */
export function mergeEvent(state: LiveBoard, live: LiveEvent): LiveBoard {
  const board = appendToBoard(state.board, live);
  if (board === state.board) return state;
  return { board, pending: [...state.pending, live] };
}

/**
 * Take a refetched board as the truth for cards, teammates and questions,
 * then re-apply the streamed events it does not include yet.
 */
export function applyRefetch(state: LiveBoard, fetched: BoardResponse): LiveBoard {
  const pending = state.pending.filter((p) => p.seq > fetched.last_seq);
  const board = pending.reduce(appendToBoard, fetched);
  return { board, pending };
}

/** Whether a board refetch is running and whether another is owed after it. */
export interface RefetchState {
  inFlight: boolean;
  queued: boolean;
}

export const idleRefetch: RefetchState = { inFlight: false, queued: false };

/**
 * Ask for a refetch. Starts one when none is running; otherwise queues a
 * single follow-up, so any number of events during a fetch costs one more.
 */
export function requestRefetch(s: RefetchState): { state: RefetchState; start: boolean } {
  if (s.inFlight) return { state: { inFlight: true, queued: true }, start: false };
  return { state: { inFlight: true, queued: false }, start: true };
}

/** A refetch finished (either way). Starts the queued follow-up, if any. */
export function refetchSettled(s: RefetchState): { state: RefetchState; start: boolean } {
  if (s.queued) return { state: { inFlight: true, queued: false }, start: true };
  return { state: idleRefetch, start: false };
}

/** Delay before reconnecting a closed stream: 1s, 2s, 4s … capped at 30s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
}
