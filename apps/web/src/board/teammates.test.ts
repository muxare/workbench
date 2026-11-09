import { describe, expect, it } from "vitest";
import { cardRef, modeCounts, panelSubline, panelTitle, placeTeammates, roleTitle, shortLabel } from "./teammates.ts";
import { testBoard } from "./testBoard.ts";
import { teammateRole, type Teammate, type TeammateRole } from "@workbench/shared";

const human = (id: string, role: TeammateRole): Teammate => ({ kind: "human", id, name: `${id} Example`, role, process_profile: {} });
const ai: Teammate = { kind: "ai", id: "ai", name: "AI" };

describe("shortLabel", () => {
  it("labels a person by role, not by name", () => {
    const [po, ux, be] = testBoard().teammates;
    expect([po, ux, be].map((t) => shortLabel(t, "x"))).toEqual(["PO", "UX", "BE"]);
    expect(shortLabel(human("x", "fe"), "x")).toBe("FE");
  });
  it("labels an AI teammate AI and an unknown id as itself", () => {
    expect(shortLabel({ kind: "ai", id: "a", name: "Anything" }, "a")).toBe("AI");
    expect(shortLabel(undefined, "ghost")).toBe("ghost");
  });
});

describe("cardRef", () => {
  it("shortens an id ending in a number and keeps any other id", () => {
    expect(cardRef("invented-151")).toBe("#151");
    expect(cardRef("abc")).toBe("abc");
  });
});

describe("panelTitle", () => {
  it("names a person by role, as the artboard does, and an AI teammate by name", () => {
    expect(panelTitle(human("x", "po"))).toBe("Product owner");
    expect(panelTitle(ai)).toBe("AI");
  });
  it("gives the product owner and the AI a sub-line, and other people their mode counts", () => {
    expect(panelSubline(human("x", "po"))).toBe("Owns the order and the milestone.");
    expect(panelSubline(ai)).toBe("Works in the mode each person set for the step.");
    for (const role of ["ux", "fe", "be"] as const) expect(panelSubline(human("x", role))).toBeUndefined();
  });
  it("has a title for every role", () => {
    expect(Object.keys(roleTitle).sort()).toEqual([...teammateRole.options].sort());
  });
});

describe("placeTeammates", () => {
  it("seats each person by role, as on the artboard, whatever the API's order", () => {
    const p = placeTeammates([ai, human("b", "be"), human("f", "fe"), human("u", "ux"), human("p", "po")]);
    expect(p.top.map((t) => t.id)).toEqual(["p"]);
    expect(p.left.map((t) => t.id)).toEqual(["u"]);
    expect(p.right.map((t) => t.id)).toEqual(["f", "b"]);
    expect(p.bottom.map((t) => t.id)).toEqual(["ai"]);
  });
  it("keeps people who share a role together, in the API's order", () => {
    const p = placeTeammates([human("b1", "be"), human("f1", "fe"), human("b2", "be"), human("f2", "fe")]);
    expect(p.right.map((t) => t.id)).toEqual(["f1", "f2", "b1", "b2"]);
    expect(p.top).toEqual([]);
  });
  it("copes with nobody", () => {
    expect(placeTeammates([])).toEqual({ top: [], left: [], right: [], bottom: [] });
  });
});

describe("modeCounts", () => {
  it("counts a person's functions per mode, zeros included", () => {
    const ux = testBoard().teammates[1]!;
    expect(modeCounts(ux)).toEqual([
      { mode: "manual", count: 1 },
      { mode: "assist", count: 1 },
      { mode: "delegate", count: 0 },
    ]);
  });
  it("is empty for an AI teammate", () => {
    expect(modeCounts({ kind: "ai", id: "a", name: "AI" })).toEqual([]);
  });
});
