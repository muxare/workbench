// INVENTED test data: the steps below are made up for the test and name no
// real function file.
import { describe, expect, it } from "vitest";
import type { Mode, ProfileStep } from "@workbench/shared";
import { aiPickSteps, modeButtons, modeShares, stepSubline } from "./profileView.ts";

function step(functionId: string, mode: Mode, over: Partial<ProfileStep> = {}): ProfileStep {
  return {
    function_id: functionId,
    role: "fe",
    title: `Invented ${functionId}`,
    summary: "Invented.",
    modes: { default: "assist", allowed: ["manual", "assist", "delegate"] },
    mode,
    mode_is_default: false,
    ai_may_pick: false,
    ...over,
  };
}

describe("modeShares", () => {
  it("counts the steps in each mode, in mode order, with each share to one decimal", () => {
    const steps = [step("a", "assist"), step("b", "delegate"), step("c", "delegate")];
    expect(modeShares(steps)).toEqual([
      { mode: "manual", count: 0, percent: 0 },
      { mode: "assist", count: 1, percent: 33.3 },
      { mode: "delegate", count: 2, percent: 66.7 },
    ]);
  });

  it("gives every mode a zero share when there are no steps", () => {
    expect(modeShares([]).map((s) => s.percent)).toEqual([0, 0, 0]);
  });
});

describe("modeButtons", () => {
  it("presses the step's mode and disables the modes its function file does not allow", () => {
    const buttons = modeButtons(step("a", "manual", { modes: { default: "manual", allowed: ["manual", "delegate"] } }));
    expect(buttons).toEqual([
      { mode: "manual", label: "I do it", pressed: true, allowed: true },
      { mode: "assist", label: "AI assists", pressed: false, allowed: false },
      { mode: "delegate", label: "AI does it", pressed: false, allowed: true },
    ]);
  });
});

describe("stepSubline", () => {
  it("shows the step's role and function name", () => {
    expect(stepSubline(step("shape_widget", "assist", { role: "team" }))).toBe("team · shape_widget");
  });
});

describe("aiPickSteps", () => {
  it("keeps the steps the AI may pick on its own, in chain order", () => {
    const steps = [step("a", "assist", { ai_may_pick: true }), step("b", "manual"), step("c", "assist", { ai_may_pick: true })];
    expect(aiPickSteps(steps).map((s) => s.function_id)).toEqual(["a", "c"]);
  });
});
