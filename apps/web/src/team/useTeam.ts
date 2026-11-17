// The team from `GET /api/team`, loaded when the screen opens and on retry.
// The screen owns this state. Modes are set on each person's profile; people
// and roles are changed on this screen, which calls `refresh` after each write
// so the table follows at once. A mode or role change made anywhere arrives on the
// board's stream; `liveKey` (teamLiveKey) then changes and the team is
// reloaded in place, keeping the table shown meanwhile. Every request takes a
// ticket (`responseOrder`), so an older answer that arrives after a newer one
// is dropped instead of showing stale modes.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamResponse } from "@workbench/shared";
import { ApiRequestError, fetchTeam } from "../api/client.ts";
import { followLiveKey } from "../profile/liveKey.ts";
import { responseOrder, type TeamState } from "./teamView.ts";

function reasonOf(err: unknown): string {
  if (err instanceof ApiRequestError) return err.reason;
  return err instanceof Error ? err.message : "the team could not be loaded";
}

export function useTeam(liveKey?: string): { state: TeamState; refresh: () => void } {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [team, setTeam] = useState<TeamResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const order = useRef(responseOrder());

  useEffect(() => {
    const abort = new AbortController();
    const ticket = order.current.start();
    setTeam(undefined);
    setLoadError(undefined);
    fetchTeam(abort.signal).then(
      (next) => {
        if (order.current.settle(ticket)) setTeam(next);
      },
      (err: unknown) => {
        if (!abort.signal.aborted) setLoadError(reasonOf(err));
      },
    );
    return () => abort.abort();
  }, [attempt]);

  // Reload in place, keeping the team shown meanwhile. An answer for a request
  // older than one already shown is dropped.
  const reloads = useRef(new Set<AbortController>());
  const refresh = useCallback(() => {
    const abort = new AbortController();
    reloads.current.add(abort);
    const ticket = order.current.start();
    fetchTeam(abort.signal)
      .then(
        (fresh) => {
          if (order.current.settle(ticket)) setTeam(fresh);
        },
        () => {
          // Keep the team shown; the next change on the stream tries again.
        },
      )
      .finally(() => reloads.current.delete(abort));
  }, []);
  useEffect(() => {
    const running = reloads.current;
    return () => {
      for (const abort of running) abort.abort();
    };
  }, []);

  const seenKey = useRef(liveKey);
  useEffect(() => {
    const next = followLiveKey(seenKey.current, liveKey);
    seenKey.current = next.seen;
    if (next.reload) refresh();
  }, [liveKey, refresh]);

  if (loadError !== undefined) return { state: { phase: "error", reason: loadError, retry }, refresh };
  if (!team) return { state: { phase: "loading" }, refresh };
  return { state: { phase: "ready", team }, refresh };
}
