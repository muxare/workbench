// A person's profile from the API, and setting the mode of one step. A change
// is shown once the API has stored it and answered with the new profile; the
// step's buttons are busy meanwhile, so a failed change never looks saved.
// Each step's critic gate, a team setting, is set the same way: shown once the
// API has stored it, with `was_required` from this view. Saves of different
// steps run side by side, each ending only its own. After a refusal the
// profile is reloaded to show the gate as it stands. An answer that arrives
// after the route has moved to another person is dropped.
// A change made anywhere else arrives as a `mode_changed` or
// `critic_gate_changed` event on the board's stream; `liveKey`
// (profileLiveKey) then changes and the profile is reloaded.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Mode, TeammateProfileResponse } from "@workbench/shared";
import { ApiRequestError, fetchProfile, setCriticGate, setMode } from "../api/client.ts";
import { followLiveKey } from "./liveKey.ts";
import { answerApplies, criticGateFailure, endSaving, startSaving, withCriticGates } from "./profileView.ts";

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
      /** The steps whose critic gate change is being stored. */
      gateSaving: ReadonlySet<string>;
      /** Why the last critic gate change failed, and on which step. */
      gateFailure: { functionId: string; reason: string } | undefined;
      setGate: (functionId: string, required: boolean) => void;
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
  const [gateSaving, setGateSaving] = useState<ReadonlySet<string>>(() => new Set());
  const [gateFailure, setGateFailure] = useState<{ functionId: string; reason: string } | undefined>();
  // The profile as shown, so a gate change sends the setting this view showed as `was_required`.
  const shown = useRef(profile);
  // The person shown now, so an answer that arrives after the route moved to someone else is dropped.
  const showing = useRef(teammateId);
  useEffect(() => {
    shown.current = profile;
    showing.current = teammateId;
  });

  useEffect(() => {
    const abort = new AbortController();
    setProfile(undefined);
    setLoadError(undefined);
    setFailure(undefined);
    setGateFailure(undefined);
    fetchProfile(teammateId, abort.signal).then(setProfile, (err: unknown) => {
      if (!abort.signal.aborted) setLoadError(reasonOf(err, "the profile could not be loaded"));
    });
    return () => abort.abort();
  }, [teammateId, attempt]);

  // Reload in place, keeping the profile shown, when the stream brings a mode change for this person
  // or a critic gate change for any function.
  const seenKey = useRef(liveKey);
  useEffect(() => {
    const next = followLiveKey(seenKey.current, liveKey);
    seenKey.current = next.seen;
    if (!next.reload) return;
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
          setSaving(undefined);
          if (!answerApplies(teammateId, showing.current)) return;
          setProfile(next);
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

  const setGate = useCallback(
    (functionId: string, required: boolean) => {
      const step = shown.current?.steps.find((s) => s.function_id === functionId);
      if (!step) return;
      setGateSaving((ids) => startSaving(ids, functionId));
      setGateFailure((f) => (f?.functionId === functionId ? undefined : f));
      // There is no sign-in yet, so the person whose profile this is makes the change.
      setCriticGate(functionId, { actor: teammateId, required, was_required: step.critic_required }).then(
        (answer) => {
          setGateSaving((ids) => endSaving(ids, functionId));
          // The gates are the team's, so they apply to whichever profile is shown now.
          setProfile((p) => (p ? withCriticGates(p, answer.critic_gates) : p));
          onChanged?.();
        },
        (err: unknown) => {
          setGateSaving((ids) => endSaving(ids, functionId));
          setGateFailure({ functionId, reason: criticGateFailure(err) });
          // Reload in place so the checkbox shows the gate as it stands, unless the route has moved to someone else.
          fetchProfile(teammateId).then(
            (next) => {
              if (answerApplies(teammateId, showing.current)) setProfile(next);
            },
            () => {
              // Keep the profile shown; the failure already says the change was not saved.
            },
          );
        },
      );
    },
    [teammateId, onChanged],
  );

  if (loadError !== undefined) return { phase: "error", reason: loadError, retry };
  if (!profile) return { phase: "loading" };
  return { phase: "ready", profile, saving, failure, choose, gateSaving, gateFailure, setGate };
}
