import { describe, expect, it } from "vitest";
import { BOARD_PANEL_LOG, cycleWindow, describeEvent, emptyCycleLog, formatTime, logLines } from "./log.ts";
import { CYCLE, testBoard } from "./testBoard.ts";

const board = testBoard();
/** The same afternoon as the test log, so its lines show the time of day. */
const NOW = new Date("2026-11-06T15:00:00Z");

describe("formatTime", () => {
  it("formats 24-hour time in the given zone", () => {
    expect(formatTime("2026-11-06T09:41:00Z", "UTC")).toBe("09:41");
    expect(formatTime("2026-11-06T21:05:00Z", "UTC")).toBe("21:05");
  });
});

describe("describeEvent", () => {
  const line = (id: string) => describeEvent(board.log.find((e) => e.id === id)!, board);
  it("describes every event type", () => {
    expect(line("e1")).toBe("UX picked #142 · mode: AI assists");
    expect(line("e3")).toBe("AI ran the structural check on #138 · passed: Invented: fine.");
    expect(line("e4")).toBe("UX posted a report on #138: Invented: report.");
    expect(line("e5")).toBe("UX moved #138 to Done");
    expect(line("e7")).toBe("AI asked BE on #151: Invented: page numbers or a cursor?");
    expect(line("e8")).toBe("AI moved #151 to Needs input · waiting on BE");
    expect(
      describeEvent({ id: "a", type: "answered", card_id: "c-151", actor: "t-be", at: "2026-11-06T09:50:00Z", question_id: "q-151", answer: "Invented: a cursor." }, board),
    ).toBe("BE answered on #151: Invented: a cursor.");
  });

  it("describes the events GitHub reports on a card", () => {
    const base = { id: "g", card_id: "c-151", actor: "t-be", at: "2026-11-06T09:57:00Z" } as const;
    const pr = "https://github.com/invented/repo/pull/7";
    expect(
      describeEvent({ ...base, type: "workspace_linked", workspace: "github", repository: "invented/repo", branch: "wb/151-paging", url: pr }, board),
    ).toBe("BE linked #151 to the branch wb/151-paging in invented/repo");
    expect(describeEvent({ ...base, type: "work_pushed", branch: "wb/151-paging", head_sha: "abc", commits: 1, forced: false, url: pr }, board)).toBe(
      "BE pushed 1 commit to wb/151-paging for #151",
    );
    expect(describeEvent({ ...base, type: "work_pushed", branch: "wb/151-paging", head_sha: "abc", commits: 3, forced: true, url: pr }, board)).toBe(
      "BE pushed 3 commits to wb/151-paging for #151 · forced",
    );
    expect(describeEvent({ ...base, type: "review_requested", pull_request: 7, title: "Invented: paging", url: pr }, board)).toBe(
      "BE asked for a review of #151 · pull request #7: Invented: paging",
    );
    expect(describeEvent({ ...base, type: "approved", pull_request: 7, url: pr }, board)).toBe("BE approved #151 · pull request #7");
    expect(describeEvent({ ...base, type: "changes_requested", pull_request: 7, url: pr }, board)).toBe(
      "BE requested changes on #151 · pull request #7",
    );
  });

  it("describes a mode change, which has no card", () => {
    const change = { id: "m", type: "mode_changed", teammate_id: "t-be", actor: "t-be", at: "2026-11-06T09:55:00Z", function_id: "define_api_contract" } as const;
    expect(describeEvent({ ...change, from: "delegate", to: "assist" }, board)).toBe(
      "BE changed their mode for define_api_contract to AI assists · was: AI does it",
    );
    expect(describeEvent({ ...change, actor: "t-ux", from: null, to: "manual" }, board)).toBe(
      "UX changed BE's mode for define_api_contract to I do it · was: the default",
    );
  });

  it("describes a person joining and a roles change", () => {
    const change = { id: "r", type: "roles_changed", teammate_id: "t-be", actor: "t-be", at: "2026-11-06T09:55:00Z" } as const;
    expect(describeEvent({ ...change, from: [], to: ["be"] }, board)).toBe("BE joined the team as BE");
    expect(describeEvent({ ...change, actor: "t-po", from: ["be"], to: ["be", "fe"] }, board)).toBe(
      "PO changed BE's roles to BE, FE · was: BE",
    );
  });

  it("describes a filter change, which is about the team", () => {
    const change = { id: "f", type: "log_filter_changed", actor: "t-po", at: "2026-11-06T09:56:00Z", log: "board" } as const;
    expect(describeEvent({ ...change, hidden: ["mode_changed", "report_posted"], was_hidden: [] }, board)).toBe(
      "PO changed the board log filter · now hides mode_changed, report_posted",
    );
    expect(describeEvent({ ...change, log: "card", hidden: [], was_hidden: ["picked"] }, board)).toBe(
      "PO changed the card log filter · now shows every event type",
    );
  });

  it("lists a mode change in the log among card events", () => {
    const log = [...board.log, { id: "m", type: "mode_changed", teammate_id: "t-be", actor: "t-be", at: "2026-11-06T09:55:00Z", function_id: "define_api_contract", from: "delegate", to: "assist" } as const];
    const withChange = testBoard({ log, cycle: { cycle: CYCLE, ended: false, log } });
    expect(logLines(withChange, NOW, "UTC")[0]).toMatchObject({ id: "m", time: "09:55", text: expect.stringContaining("changed their mode") });
  });
});

describe("logLines", () => {
  it("lists the current cycle's log, newest first", () => {
    const lines = logLines(board, NOW, "UTC");
    expect(lines[0]).toMatchObject({ id: "e8", time: "09:41" });
    expect(lines.at(-1)!.id).toBe("e1");
  });
  it("shows the cycle's log, not the board's latest events", () => {
    const onlyTwo = testBoard({ cycle: { cycle: CYCLE, ended: false, log: board.log.slice(0, 2) } });
    expect(logLines(onlyTwo, NOW, "UTC").map((l) => l.id)).toEqual(["e2", "e1"]);
  });
  it("dates a line from an earlier day", () => {
    expect(logLines(board, new Date("2026-11-20T15:00:00Z"), "UTC")[0]!.time).toBe("6 Nov");
  });
  it("is empty with no cycle or an empty log", () => {
    expect(logLines(testBoard({ cycle: null }), NOW)).toEqual([]);
    expect(logLines(testBoard({ cycle: { cycle: CYCLE, ended: false, log: [] } }), NOW)).toEqual([]);
  });
  it("takes the cycle log's filter, not another log's, and leaves the logs whole", () => {
    const filtered = testBoard({ log_filters: { ...board.log_filters, cycle: ["picked", "status_changed"], board: ["asked"], card: ["asked"] } });
    expect(BOARD_PANEL_LOG).toBe("cycle");
    expect(logLines(filtered, NOW, "UTC").map((l) => l.id)).toEqual(["e7", "e4", "e3"]);
    expect(filtered.cycle!.log).toHaveLength(board.log.length);
  });
});

describe("cycleWindow", () => {
  it("names the first and the end day", () => {
    expect(cycleWindow(CYCLE, "UTC")).toBe("2 Nov – 16 Nov");
  });
  it("adds the years when the window crosses one", () => {
    expect(cycleWindow({ ...CYCLE, starts_at: "2026-12-21T08:00:00Z", ends_at: "2027-01-04T08:00:00Z" }, "UTC")).toBe("21 Dec 2026 – 4 Jan 2027");
  });
});

describe("emptyCycleLog", () => {
  it("says why the panel has no lines", () => {
    expect(emptyCycleLog(board, 3)).toBeUndefined();
    expect(emptyCycleLog(testBoard({ cycle: null }), 0)).toBe("No cycle has started yet.");
    expect(emptyCycleLog(testBoard({ cycle: { cycle: CYCLE, ended: false, log: [] } }), 0)).toBe("Nothing has happened in this cycle yet.");
    expect(emptyCycleLog(board, 0)).toBe("The filter hides every event in this cycle.");
  });
});
