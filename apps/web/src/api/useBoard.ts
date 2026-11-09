// The board, kept current. Loads `GET /api/board`, then follows
// `GET /api/events?after=<last_seq>`: each streamed event goes into the log at
// once (so the cycle log moves live) and a burst of events, such as the five
// of one AI run, costs one refetch of the board, which is where card status
// comes from. The server sets each message's SSE `id` to its seq, so the
// browser's own reconnect sends `Last-Event-ID` and resumes without a gap; a
// stream the browser gives up on is reopened here after the board's last_seq.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { ApiRequestError, eventsUrl, fetchBoard } from "./client.ts";
import {
  applyRefetch,
  idleRefetch,
  liveBoard,
  mergeEvent,
  parseStreamMessage,
  reconnectDelay,
  refetchSettled,
  requestRefetch,
  type LiveBoard,
} from "./boardState.ts";

export type BoardConnection = "connecting" | "live" | "reconnecting";
export type BoardState =
  | { phase: "loading" }
  | { phase: "error"; reason: string; retry: () => void }
  | {
      phase: "ready";
      board: BoardResponse;
      connection: BoardConnection;
      /** Refetch the board, for a change that reaches no event stream, such as a person's modes. */
      refresh: () => void;
    };

/** How long to wait for the rest of a burst of events before refetching. */
const BURST_MS = 150;
/** How long to wait before trying a failed refetch again. */
const REFETCH_RETRY_MS = 2_000;

function reasonOf(err: unknown): string {
  if (err instanceof ApiRequestError) return err.reason;
  return err instanceof Error ? err.message : "the board could not be loaded";
}

export function useBoard(): BoardState {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [state, setState] = useState<BoardState>({ phase: "loading" });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    let live: LiveBoard | undefined;
    let connection: BoardConnection = "connecting";
    let source: EventSource | undefined;
    let refetch = idleRefetch;
    let reconnects = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let burstPending = false;

    const later = (ms: number, run: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!disposed) run();
      }, ms);
      timers.add(t);
    };

    const publish = () => {
      if (!disposed && live) setState({ phase: "ready", board: live.board, connection, refresh });
    };

    const runRefetch = () => {
      fetchBoard(abort.signal).then(
        (board) => {
          if (disposed || !live) return;
          live = applyRefetch(live, board);
          publish();
          settle();
        },
        () => {
          if (disposed) return;
          // Keep the board as it is and try again; queued work folds into the retry.
          refetch = idleRefetch;
          later(REFETCH_RETRY_MS, askForRefetch);
        },
      );
    };

    const settle = () => {
      const next = refetchSettled(refetch);
      refetch = next.state;
      if (next.start) runRefetch();
    };

    const askForRefetch = () => {
      const next = requestRefetch(refetch);
      refetch = next.state;
      if (next.start) runRefetch();
    };

    const scheduleRefetch = () => {
      if (burstPending) return;
      burstPending = true;
      later(BURST_MS, () => {
        burstPending = false;
        askForRefetch();
      });
    };

    const open = (after: number) => {
      const es = new EventSource(eventsUrl(after));
      source = es;
      es.onopen = () => {
        reconnects = 0;
        connection = "live";
        publish();
      };
      es.onmessage = (message: MessageEvent<string>) => {
        if (!live) return;
        const parsed = parseStreamMessage(message.data, message.lastEventId);
        if (!parsed) return;
        const next = mergeEvent(live, parsed);
        if (next === live) return;
        live = next;
        publish();
        scheduleRefetch();
      };
      es.onerror = () => {
        connection = "reconnecting";
        if (es.readyState === EventSource.CLOSED) {
          // The browser gave up (e.g. a non-stream answer); reopen after what we have.
          es.close();
          source = undefined;
          later(reconnectDelay(reconnects++), () => open(live?.board.last_seq ?? after));
        }
        publish();
      };
    };

    refreshRef.current = () => {
      if (!disposed && live) askForRefetch();
    };

    setState((s) => (s.phase === "loading" ? s : { phase: "loading" }));
    fetchBoard(abort.signal).then(
      (board) => {
        if (disposed) return;
        live = liveBoard(board);
        publish();
        open(board.last_seq);
      },
      (err: unknown) => {
        if (!disposed) setState({ phase: "error", reason: reasonOf(err), retry });
      },
    );

    return () => {
      disposed = true;
      abort.abort();
      source?.close();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, [attempt, retry, refresh]);

  return state;
}
