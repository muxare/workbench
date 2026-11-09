// The Profile artboard's view-model: pure functions over the API's profile.
// Which steps a person has, their titles and which modes each allows come from
// the function files in process/ through the API; nothing here names a
// function or a function field's value.
import type { Mode, ProfileStep } from "@workbench/shared";
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

