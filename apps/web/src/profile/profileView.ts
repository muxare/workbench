// The Profile artboard's view-model: pure functions over the API's profile.
// Which steps a person has, their titles and which modes each allows come from
// the function files in process/ through the API; nothing here names a
// function or a function field's value.
import { criticRequired, type CriticGates, type Mode, type ProfileStep, type TeammateProfileResponse } from "@workbench/shared";
import { ApiRequestError } from "../api/client.ts";
import { modeLabel, modes } from "../board/modes.ts";

export interface ModeShare {
  mode: Mode;
  count: number;
  /** Share of all steps, in percent with one decimal, for the bar's segment width. */
  percent: number;
}

/** How many steps are in each mode, and each mode's share of the bar, in mode order. */
export function modeShares(steps: readonly ProfileStep[]): ModeShare[] {
  const total = steps.length;
  return modes.map((mode) => {
    const count = steps.filter((s) => s.mode === mode).length;
    return { mode, count, percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10 };
  });
}

export interface ModeButton {
  mode: Mode;
  label: string;
  pressed: boolean;
  /** False when the function file's `modes.allowed` leaves this mode out. */
  allowed: boolean;
}

/** The three mode buttons of one step, in mode order. */
export function modeButtons(step: ProfileStep): ModeButton[] {
  return modes.map((mode) => ({
    mode,
    label: modeLabel[mode],
    pressed: step.mode === mode,
    allowed: step.modes.allowed.includes(mode),
  }));
}

/**
 * The mono line under a step's title. The artboard shows "stage · function";
 * the function files have no stage, so the step's role stands in its place.
 */
export function stepSubline(step: ProfileStep): string {
  return `${step.role} · ${step.function_id}`;
}

/** The steps on which the AI teammate may pick a Ready card on its own, in chain order. */
export function aiPickSteps(steps: readonly ProfileStep[]): ProfileStep[] {
  return steps.filter((s) => s.ai_may_pick);
}


/** What a step's critic gate control says: the gate is a team setting, so it says so. */
export function criticGateHint(step: ProfileStep): string {
  const now = step.critic_required ? "On" : "Off";
  return `${now} for the whole team: when on, the AI critic must pass on a pull request before a person's approval moves a card of ${step.function_id} to done.`;
}

/** The profile with each step's critic gate taken from `gates`, the API's answer to a change. */
export function withCriticGates(profile: TeammateProfileResponse, gates: CriticGates): TeammateProfileResponse {
  return { ...profile, steps: profile.steps.map((s) => ({ ...s, critic_required: criticRequired(gates, s.function_id) })) };
}

/**
 * Why a critic gate change was not saved, after "Not saved:". A 409 means the
 * view was stale: someone changed the gate since it was loaded, and the
 * profile is reloaded to show the gate as it stands.
 */
export function criticGateFailure(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.code === "conflict" ? "someone changed this gate in the meantime; it now shows the current setting" : err.reason;
  }
  return err instanceof Error ? err.message : "the critic gate could not be saved";
}
