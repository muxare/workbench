import { describe, expect, it } from "vitest";
import { cardRef, modeCounts, placeTeammates, shortLabel } from "./teammates.ts";
import { testBoard } from "./testBoard.ts";
import type { Teammate } from "@workbench/shared";

const human = (id: string): Teammate => ({ kind: "human", id, name: `${id} Example`, process_profile: {} });

describe("shortLabel", () => {
  it("uses initials for a person, dropping any parenthetical", () => {
    const [po] = testBoard().teammates;
    expect(shortLabel(po, "x")).toBe("RE");
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

describe("placeTeammates", () => {
  it("matches the artboard for four people and an AI", () => {
    const p = placeTeammates([human("po"), human("ux"), human("fe"), human("be"), { kind: "ai", id: "ai", name: "AI" }]);
    expect(p.top.map((t) => t.id)).toEqual(["po"]);
    expect(p.left.map((t) => t.id)).toEqual(["ux"]);
    expect(p.right.map((t) => t.id)).toEqual(["fe", "be"]);
    expect(p.bottom.map((t) => t.id)).toEqual(["ai"]);
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
