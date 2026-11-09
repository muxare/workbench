// The AI teammate's profile from the API, kept current like card detail: it
// loads again whenever the live board (which follows the SSE stream in
// `useBoard`) shows a new event or a changed teammate, so it needs no stream
// of its own.
import { useCallback, useEffect, useState } from "react";
import type { AiTeammateProfileResponse, BoardResponse } from "@workbench/shared";
import { ApiRequestError, fetchAiProfile } from "../api/client.ts";
import { aiProfileRefreshKey } from "./aiProfileView.ts";

export type AiProfileState =
  | { phase: "loading" }
  | { phase: "error"; reason: string; retry: () => void }
  | { phase: "ready"; profile: AiTeammateProfileResponse };

export function useAiProfile(teammateId: string, board: BoardResponse): AiProfileState {
  const key = aiProfileRefreshKey(board);
  const [reloads, setReloads] = useState(0);
  const retry = useCallback(() => setReloads((n) => n + 1), []);
  const [state, setState] = useState<AiProfileState>({ phase: "loading" });
  const [shownId, setShownId] = useState(teammateId);

  if (shownId !== teammateId) {
    setShownId(teammateId);
    setState({ phase: "loading" });
  }

  useEffect(() => {
    const abort = new AbortController();
    fetchAiProfile(teammateId, abort.signal).then(
      (profile) => setState({ phase: "ready", profile }),
      (err: unknown) => {
        if (abort.signal.aborted) return;
        // Keep a profile already shown when a refresh fails; the next change retries.
        setState((s) =>
          s.phase === "ready"
            ? s
            : { phase: "error", reason: err instanceof ApiRequestError ? err.reason : "the profile could not be loaded", retry },
        );
      },
    );
    return () => abort.abort();
  }, [teammateId, key, reloads, retry]);

  return state;
}
