// The team from `GET /api/team`, loaded when the screen opens and on retry.
// The screen owns this state; it is read-only, since modes are set on each
// person's profile. A mode or role change made anywhere arrives on the
// board's stream; `liveKey` (teamLiveKey) then changes and the team is
// reloaded in place, keeping the table shown meanwhile.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamResponse } from "@workbench/shared";
import { ApiRequestError, fetchTeam } from "../api/client.ts";
import { followLiveKey } from "../profile/liveKey.ts";
import type { TeamState } from "./teamView.ts";

function reasonOf(err: unknown): string {
  if (err instanceof ApiRequestError) return err.reason;
  return err instanceof Error ? err.message : "the team could not be loaded";
}

export function useTeam(liveKey?: string): TeamState {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [team, setTeam] = useState<TeamResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  useEffect(() => {
    const abort = new AbortController();
    setTeam(undefined);
    setLoadError(undefined);
    fetchTeam(abort.signal).then(setTeam, (err: unknown) => {
      if (!abort.signal.aborted) setLoadError(reasonOf(err));
    });
    return () => abort.abort();
  }, [attempt]);

  const seenKey = useRef(liveKey);
  useEffect(() => {
    const next = followLiveKey(seenKey.current, liveKey);
    seenKey.current = next.seen;
    if (!next.reload) return;
    const abort = new AbortController();
    fetchTeam(abort.signal).then(setTeam, () => {
      // Keep the team shown; the next change on the stream tries again.
    });
    return () => abort.abort();
  }, [liveKey]);

  if (loadError !== undefined) return { phase: "error", reason: loadError, retry };
  if (!team) return { phase: "loading" };
  return { phase: "ready", team };
}
