import { describe, expect, it } from "vitest";
import {
  cardRef,
  modeCounts,
  otherRolesLine,
  panelSubline,
  panelTitle,
  placeTeammates,
  roleTitle,
  rolesLabel,
  shortLabel,
} from "./teammates.ts";
import { liveBoard, mergeEvent, type LiveBoard } from "../api/boardState.ts";
import { TEST_FUNCTIONS, testBoard } from "./testBoard.ts";
import { teammateRole, type HumanTeammate, type Teammate, type TeammateRole } from "@workbench/shared";

const human = (id: string, ...roles: [TeammateRole, ...TeammateRole[]]): HumanTeammate => ({
  kind: "human",
  id,
  name: `${id} Example`,
  roles,
  process_profile: {},
});
const ai: Teammate = { kind: "ai", id: "ai", name: "AI" };

describe("shortLabel", () => {
  it("labels a person by role, not by name", () => {
    const [po, ux, be] = testBoard().teammates;
    expect([po, ux, be].map((t) => shortLabel(t, "x"))).toEqual(["PO", "UX", "BE"]);
    expect(shortLabel(human("x", "fe"), "x")).toBe("FE");
  });
  it("labels a person with several roles by their main role, the first", () => {
    expect(shortLabel(human("x", "fe", "po", "ux"), "x")).toBe("FE");
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
  it("names a person with several roles by the first, lists the others, and gives mode counts if any role owns steps", () => {
    const all = human("x", "po", "ux", "fe", "be");
    expect(panelTitle(all)).toBe("Product owner");
    expect(otherRolesLine(all)).toBe("Also UX · FE · BE");
    expect(rolesLabel(all)).toBe("PO · UX · FE · BE");
    expect(panelSubline(all)).toBeUndefined();
    expect(otherRolesLine(human("x", "po"))).toBeUndefined();
    expect(otherRolesLine(ai)).toBeUndefined();
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
  it("seats a person with several roles once, at their main role's seat", () => {
    const p = placeTeammates([human("all", "po", "ux", "fe", "be"), human("fu", "fe", "ux"), human("b", "be"), ai]);
    expect(p.top.map((t) => t.id)).toEqual(["all"]);
    expect(p.left).toEqual([]);
    expect(p.right.map((t) => t.id)).toEqual(["fu", "b"]);
    expect(p.bottom.map((t) => t.id)).toEqual(["ai"]);
  });
  it("copes with nobody", () => {
    expect(placeTeammates([])).toEqual({ top: [], left: [], right: [], bottom: [] });
  });
});

describe("modeCounts", () => {
  const counts = (manual: number, assist: number, delegate: number) => [
    { mode: "manual", count: manual },
    { mode: "assist", count: assist },
    { mode: "delegate", count: delegate },
  ];

  it("counts a person's chain per mode: their role's functions and the ones they chose, zeros included", () => {
    // frame_problem (ux) in assist and fix_bug (team, chosen) in manual.
    const ux = testBoard().teammates[1]!;
    expect(modeCounts(ux, TEST_FUNCTIONS)).toEqual(counts(1, 1, 0));
  });
  it("counts a person with no modes of their own at each function's default", () => {
    // The bug seen on 2026-11-11: this panel read "0 I do · 0 assist · 0 AI".
    const all = human("x", "po", "ux", "fe", "be");
    // frame_problem, refine_ui_spec and define_api_contract default to assist; implement_services to delegate.
    expect(modeCounts(all, TEST_FUNCTIONS)).toEqual(counts(0, 3, 1));
  });
  it("counts every role of a person with several, their own choices over the defaults", () => {
    const p: HumanTeammate = { ...human("x", "fe", "be"), process_profile: { refine_ui_spec: "manual", write_issues: "assist" } };
    expect(modeCounts(p, TEST_FUNCTIONS)).toEqual(counts(1, 2, 1));
  });
  it("is empty for an AI teammate", () => {
    expect(modeCounts({ kind: "ai", id: "a", name: "AI" }, TEST_FUNCTIONS)).toEqual([]);
  });
  it("follows streamed roles_changed and mode_changed events without a refetch", () => {
    const at = "2026-11-11T10:00:00.000Z";
    const start = testBoard({ teammates: [human("x", "po")] });
    const countsOf = (s: LiveBoard) => modeCounts(s.board.teammates[0]!, s.board.functions);
    let state = liveBoard(start);
    expect(countsOf(state)).toEqual(counts(0, 0, 0));
    state = mergeEvent(state, {
      seq: start.last_seq + 1,
      event: { id: "r1", type: "roles_changed", teammate_id: "x", actor: "x", at, from: ["po"], to: ["po", "ux", "be"] },
    });
    expect(countsOf(state)).toEqual(counts(0, 2, 1));
    state = mergeEvent(state, {
      seq: start.last_seq + 2,
      event: { id: "m1", type: "mode_changed", teammate_id: "x", actor: "x", at, function_id: "implement_services", from: null, to: "manual" },
    });
    expect(countsOf(state)).toEqual(counts(1, 2, 0));
  });
});

