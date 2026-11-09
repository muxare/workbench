// A person's profile from the API, and setting the mode of one step. A change
// is shown once the API has stored it and answered with the new profile; the
// step's buttons are busy meanwhile, so a failed change never looks saved.
// A change made anywhere else arrives as a `mode_changed` event on the board's
// stream; `liveKey` (profileLiveKey) then changes and the profile is reloaded.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Mode, TeammateProfileResponse } from "@workbench/shared";
import { ApiRequestError, fetchProfile, setMode } from "../api/client.ts";

export type ProfileState =
  | { phase: "loading" }
  | { phase: "error"; reason: string; retry: () => void }
  | {
      phase: "ready";
      profile: TeammateProfileResponse;
      /** The step whose change is being stored, if any. */
      saving: string | undefined;
      /** Why the last change failed, and on which step. */
      failure: { functionId: string; reason: string } | undefined;
      choose: (functionId: string, mode: Mode) => void;
    };

function reasonOf(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.reason;
  return err instanceof Error ? err.message : fallback;
}

/** `onChanged` runs after a change is stored, so the board can refresh its mode counts. */
export function useProfile(teammateId: string, onChanged: (() => void) | undefined, liveKey?: string): ProfileState {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const [profile, setProfile] = useState<TeammateProfileResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [saving, setSaving] = useState<string | undefined>();
  const [failure, setFailure] = useState<{ functionId: string; reason: string } | undefined>();

  useEffect(() => {
    const abort = new AbortController();
    setProfile(undefined);
    setLoadError(undefined);
    setFailure(undefined);
    fetchProfile(teammateId, abort.signal).then(setProfile, (err: unknown) => {
      if (!abort.signal.aborted) setLoadError(reasonOf(err, "the profile could not be loaded"));
    });
    return () => abort.abort();
  }, [teammateId, attempt]);

  // Reload in place, keeping the profile shown, when the stream brings a mode change for this person.
  const seenKey = useRef(liveKey);
  useEffect(() => {
    const previous = seenKey.current;
    seenKey.current = liveKey;
    if (previous === undefined || liveKey === undefined || previous === liveKey) return;
    const abort = new AbortController();
    fetchProfile(teammateId, abort.signal).then(setProfile, () => {
      // Keep the profile shown; the next change on the stream tries again.
    });
    return () => abort.abort();
  }, [teammateId, liveKey]);

  const choose = useCallback(
    (functionId: string, mode: Mode) => {
      setSaving(functionId);
      setFailure(undefined);
      // There is no sign-in yet, so the person changes their own profile.
      setMode(teammateId, { actor: teammateId, function_id: functionId, mode }).then(
        (next) => {
          setProfile(next);
          setSaving(undefined);
          onChanged?.();
        },
        (err: unknown) => {
          setSaving(undefined);
          setFailure({ functionId, reason: reasonOf(err, "the change could not be saved") });
        },
      );
    },
    [teammateId, onChanged],
  );

  if (loadError !== undefined) return { phase: "error", reason: loadError, retry };
  if (!profile) return { phase: "loading" };
  return { phase: "ready", profile, saving, failure, choose };
}
