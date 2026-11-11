// All data here is invented.
import { describe, expect, it } from "vitest";
import { chainModeCounts, chainOf, mayMoveCard, ownerMode, type ChainFunction, type MoveFunction } from "./chain.ts";
import type { AiTeammate, HumanTeammate } from "./domain.ts";

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

describe("mayMoveCard", () => {
  // Written as in every function file today: the person writes in manual and assist, the AI in delegate.
  const implement: MoveFunction = {
    name: "implement_services",
    role: "be",
    modes: { default: "delegate" },
    protocols: { manual: { writes: "human" }, assist: { writes: "human" }, delegate: { writes: "ai" } },
  };
  const ai: AiTeammate = { kind: "ai", id: "invented-ai", name: "Invented AI" };
  const other: HumanTeammate = { ...person(["be"]), id: "invented-other" };

  it("lets the owner move their own card in every mode", () => {
    for (const m of ["manual", "assist", "delegate"] as const) {
      const owner = person(["be"], { implement_services: m });
      expect(mayMoveCard(owner, owner, implement)).toEqual({ allowed: true });
    }
  });

  it("lets the AI move the card only where the protocol of the owner's mode has the AI write", () => {
    expect(mayMoveCard(ai, person(["be"]), implement)).toEqual({ allowed: true });
    expect(mayMoveCard(ai, person(["be"], { implement_services: "delegate" }), implement)).toEqual({ allowed: true });
    for (const m of ["manual", "assist"] as const) {
      const verdict = mayMoveCard(ai, person(["be"], { implement_services: m }), implement);
      expect(verdict.allowed).toBe(false);
      expect(!verdict.allowed && verdict.reason).toMatch(new RegExp(`in ${m}, where human writes, so only invented may move the card, not invented-ai`));
    }
    const both: MoveFunction = { ...implement, protocols: { ...implement.protocols, assist: { writes: "both" } } };
    expect(mayMoveCard(ai, person(["be"], { implement_services: "assist" }), both)).toEqual({ allowed: true });
  });

  it("reads who writes from the protocol, not from the mode's name", () => {
    const humanDelegate: MoveFunction = { ...implement, protocols: { ...implement.protocols, delegate: { writes: "human" } } };
    expect(mayMoveCard(ai, person(["be"]), humanDelegate).allowed).toBe(false);
    const verdict = mayMoveCard(ai, person(["be"]), { ...implement, protocols: {} });
    expect(!verdict.allowed && verdict.reason).toMatch(/has no protocol for delegate/);
  });

  it("does not let another person move someone else's card, in any mode", () => {
    for (const m of ["manual", "assist", "delegate"] as const) {
      expect(mayMoveCard(other, person(["be"], { implement_services: m }), implement).allowed).toBe(false);
    }
  });

  it("lets only an AI owner move its own card", () => {
    expect(mayMoveCard(ai, ai, implement)).toEqual({ allowed: true });
    expect(mayMoveCard(person(["be"]), ai, implement).allowed).toBe(false);
  });
});
