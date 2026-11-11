// All data here is invented.
import { describe, expect, it } from "vitest";
import { chainModeCounts, chainOf, ownerMode, type ChainFunction } from "./chain.ts";
import type { HumanTeammate } from "./domain.ts";

const fns: ChainFunction[] = [
  { name: "frame_problem", role: "ux", modes: { default: "assist" } },
  { name: "write_issues", role: "team", modes: { default: "delegate" } },
  { name: "refine_ui_spec", role: "fe", modes: { default: "assist" } },
  { name: "define_api_contract", role: "be", modes: { default: "assist" } },
  { name: "implement_services", role: "be", modes: { default: "delegate" } },
];

const person = (roles: HumanTeammate["roles"], process_profile: HumanTeammate["process_profile"] = {}): HumanTeammate => ({
  kind: "human",
  id: "invented",
  name: "Invented person",
  roles,
  process_profile,
});

describe("ownerMode", () => {
  it("is the person's choice, or the function's default", () => {
    expect(ownerMode(person(["ux"], { frame_problem: "manual" }), fns[0]!)).toBe("manual");
    expect(ownerMode(person(["ux"]), fns[0]!)).toBe("assist");
  });
});

describe("chainOf", () => {
  it("lists a person's own functions in the order given, then the others they chose a mode for", () => {
    const p = person(["be"], { write_issues: "manual", frame_problem: "assist" });
    expect(chainOf(p, fns).map((f) => f.name)).toEqual(["define_api_contract", "implement_services", "frame_problem", "write_issues"]);
  });
  it("covers every role a person holds, and ignores a chosen mode for a function nobody defines", () => {
    const p = person(["po", "ux", "fe", "be"], { gone_function: "manual" });
    expect(chainOf(p, fns).map((f) => f.name)).toEqual(["frame_problem", "refine_ui_spec", "define_api_contract", "implement_services"]);
  });
});

describe("chainModeCounts", () => {
  it("counts a person with no modes of their own at each function's default", () => {
    expect(chainModeCounts(person(["po", "ux", "fe", "be"]), fns)).toEqual({ manual: 0, assist: 3, delegate: 1 });
  });
  it("counts a person's own choices over the defaults, across all their roles", () => {
    const p = person(["fe", "be"], { refine_ui_spec: "manual", write_issues: "assist" });
    expect(chainModeCounts(p, fns)).toEqual({ manual: 1, assist: 2, delegate: 1 });
  });
  it("is all zeros for a role that owns no function", () => {
    expect(chainModeCounts(person(["po"]), fns)).toEqual({ manual: 0, assist: 0, delegate: 0 });
  });
});
