// INVENTED test data: the steps below are made up for the test and name no
// real function file.
import { describe, expect, it } from "vitest";
import type { Mode, ProfileStep, TeammateProfileResponse } from "@workbench/shared";
import { ApiRequestError } from "../api/client.ts";
import { aiPickSteps, criticGateFailure, criticGateHint, modeButtons, modeShares, stepSubline, withCriticGates } from "./profileView.ts";

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
    critic_required: false,
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

describe("criticGateHint", () => {
  it("says whether the gate is on, that it is the team's, and what it does for the step's function", () => {
    expect(criticGateHint(step("shape_widget", "assist", { critic_required: true }))).toMatch(/^On for the whole team: .*shape_widget to done\.$/);
    expect(criticGateHint(step("shape_widget", "assist"))).toMatch(/^Off for the whole team/);
  });
});

describe("withCriticGates", () => {
  it("sets each step's gate from the answer, and turns off a step the answer does not list", () => {
    const profile: TeammateProfileResponse = {
      teammate: { kind: "human", id: "invented-fe", name: "Invented", roles: ["fe"], process_profile: {} },
      steps: [step("a", "assist", { critic_required: true }), step("b", "manual"), step("c", "delegate")],
      unknown_functions: [],
    };
    const next = withCriticGates(profile, { b: true, c: false, elsewhere: true });
    expect(next.steps.map((s) => [s.function_id, s.critic_required])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
    expect(profile.steps[0]?.critic_required).toBe(true);
  });
});

describe("criticGateFailure", () => {
  it("reads a stale view's 409 as someone else's change, and passes on the API's other reasons", () => {
    expect(criticGateFailure(new ApiRequestError("conflict", "invented: the AI critic is required", 409))).toMatch(/someone changed this gate/);
    expect(criticGateFailure(new ApiRequestError("forbidden", "invented: set by a person", 403))).toBe("invented: set by a person");
    expect(criticGateFailure(new ApiRequestError("network", "the API cannot be reached"))).toBe("the API cannot be reached");
    expect(criticGateFailure("nonsense")).toBe("the critic gate could not be saved");
  });
});
