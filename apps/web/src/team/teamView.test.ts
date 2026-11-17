// INVENTED test data: the people and steps are made up for the test.
import { describe, expect, it } from "vitest";
import { teamResponse, type StreamEvent, type TeamResponse } from "@workbench/shared";
import { BOARD_LOG_LIMIT } from "../api/boardState.ts";
import { testBoard, UX } from "../board/testBoard.ts";
import { followLiveKey } from "../profile/liveKey.ts";
import { aiPickCount, emptyReason, teamColumns, teamLiveKey, teamRows, teamScreen, type TeamState } from "./teamView.ts";

const team: TeamResponse = teamResponse.parse({
  steps: [
    { function_id: "shape_widget", role: "fe", title: "Shape the widget", summary: "Invented." },
    { function_id: "design_widget", role: "ux", title: "Design the widget", summary: "Invented." },
  ],
  people: [
    {
      teammate: { kind: "human", id: "inv-fe", name: "Invented frontend developer", roles: ["fe"], process_profile: {} },
      cells: [{ function_id: "shape_widget", mode: "assist", mode_is_default: true, ai_may_pick: true }],
    },
    {
      teammate: { kind: "human", id: "inv ux/1", name: "Invented designer", roles: ["ux", "fe"], process_profile: { shape_widget: "delegate" } },
      cells: [
        { function_id: "shape_widget", mode: "delegate", mode_is_default: false, ai_may_pick: false },
        { function_id: "design_widget", mode: "manual", mode_is_default: false, ai_may_pick: false },
      ],
    },
  ],
});

const retry = () => {};

describe("teamScreen: the screen's states", () => {
  it("is loading before the team has arrived", () => {
    expect(teamScreen({ phase: "loading" })).toBe("loading");
  });

  it("is an error when the API refused or could not be reached", () => {
    expect(teamScreen({ phase: "error", reason: "the API cannot be reached", retry })).toBe("error");
  });

  it("is empty when there is no person, or no step", () => {
    const noPeople: TeamState = { phase: "ready", team: { ...team, people: [] } };
    const noSteps: TeamState = { phase: "ready", team: { ...team, steps: [] } };
    expect(teamScreen(noPeople)).toBe("empty");
    expect(teamScreen(noSteps)).toBe("empty");
    expect(emptyReason(noPeople.team)).toMatch(/no person/);
    expect(emptyReason(noSteps.team)).toMatch(/no function file/);
  });

  it("is the table when there are people and steps", () => {
    expect(teamScreen({ phase: "ready", team })).toBe("table");
  });
});

describe("teamColumns", () => {
  it("has one column per person, in the API's order, linking to their profile", () => {
    expect(teamColumns(team)).toEqual([
      { id: "inv-fe", label: "FE", name: "Invented frontend developer", roles: "Frontend developer", href: "#/teammates/inv-fe" },
      { id: "inv ux/1", label: "UX", name: "Invented designer", roles: "UX designer · Frontend developer", href: "#/teammates/inv%20ux%2F1" },
    ]);
  });
});

describe("teamRows", () => {
  const rows = teamRows(team);

  it("has one row per step, in the API's order, with a cell per person", () => {
    expect(rows.map((r) => r.step.function_id)).toEqual(["shape_widget", "design_widget"]);
    expect(rows.map((r) => r.cells.map((c) => c.personId))).toEqual([
      ["inv-fe", "inv ux/1"],
      ["inv-fe", "inv ux/1"],
    ]);
  });

  it("shows each person's mode, whether it is the default and whether the AI may pick, as the API says", () => {
    expect(rows[0]?.cells[0]).toMatchObject({ kind: "mode", mode: "assist", label: "AI assists", isDefault: true, aiMayPick: true });
    expect(rows[0]?.cells[1]).toMatchObject({ kind: "mode", mode: "delegate", label: "AI does it", isDefault: false, aiMayPick: false });
    expect(rows[0]?.cells[0]?.description).toMatch(/may pick a Ready card on it on its own/);
    expect(rows[0]?.cells[1]?.description).toMatch(/does not pick it on its own/);
  });

  it("marks a step outside a person's chain as none", () => {
    expect(rows[1]?.cells[0]).toMatchObject({ kind: "none", personId: "inv-fe" });
    expect(rows[1]?.cells[0]?.description).toMatch(/not in their chain/);
  });

  it("links every cell, with a mode or not, to that person's profile", () => {
    for (const row of rows) {
      expect(row.cells.map((c) => c.href)).toEqual(["#/teammates/inv-fe", "#/teammates/inv%20ux%2F1"]);
    }
  });
});

describe("aiPickCount", () => {
  it("counts the cells the AI may pick of all cells with a mode", () => {
    expect(aiPickCount(team)).toEqual({ may: 1, total: 3 });
  });
});

describe("teamLiveKey", () => {
  const report = (id: string): StreamEvent => ({ id, type: "report_posted", card_id: "c-151", actor: UX, at: "2026-11-17T10:00:00Z", text: "Invented." });
  const modeChange: StreamEvent = {
    id: "m1",
    type: "mode_changed",
    teammate_id: UX,
    actor: UX,
    at: "2026-11-17T10:00:00Z",
    function_id: "shape_widget",
    from: null,
    to: "assist",
  };
  const rolesChange: StreamEvent = { id: "r1", type: "roles_changed", teammate_id: UX, actor: UX, at: "2026-11-17T10:01:00Z", from: ["ux"], to: ["ux", "fe"] };

  it("is undefined without a board and empty when the log holds no mode or role change", () => {
    expect(teamLiveKey(undefined)).toBeUndefined();
    expect(teamLiveKey(testBoard({ log: [report("a")] }))).toBe("");
  });

  it("is the latest mode or role change about anyone", () => {
    expect(teamLiveKey(testBoard({ log: [modeChange, report("a")] }))).toBe("m1");
    expect(teamLiveKey(testBoard({ log: [modeChange, rolesChange, report("a")] }))).toBe("r1");
  });

  it("reloads the team on a new change, and not when the change scrolls out of the log", () => {
    const first = teamLiveKey(testBoard({ log: [modeChange] }));
    let next = followLiveKey(undefined, first);
    expect(next.reload).toBe(false);
    next = followLiveKey(next.seen, teamLiveKey(testBoard({ log: [modeChange, rolesChange] })));
    expect(next).toEqual({ seen: "r1", reload: true });
    const scrolled = Array.from({ length: BOARD_LOG_LIMIT }, (_, i) => report(`r${i}`));
    expect(followLiveKey(next.seen, teamLiveKey(testBoard({ log: scrolled })))).toEqual({ seen: "r1", reload: false });
  });
});
