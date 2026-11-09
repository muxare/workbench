import { describe, expect, it } from "vitest";
import { BOARD_PANEL_LOG, describeEvent, formatTime, logLines } from "./log.ts";
import { testBoard } from "./testBoard.ts";

const board = testBoard();

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

  it("describes a mode change, which has no card", () => {
    const change = { id: "m", type: "mode_changed", teammate_id: "t-be", actor: "t-be", at: "2026-11-06T09:55:00Z", function_id: "define_api_contract" } as const;
    expect(describeEvent({ ...change, from: "delegate", to: "assist" }, board)).toBe(
      "BE changed their mode for define_api_contract to AI assists · was: AI does it",
    );
    expect(describeEvent({ ...change, actor: "t-ux", from: null, to: "manual" }, board)).toBe(
      "UX changed BE's mode for define_api_contract to I do it · was: the default",
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
    const withChange = testBoard({
      log: [...board.log, { id: "m", type: "mode_changed", teammate_id: "t-be", actor: "t-be", at: "2026-11-06T09:55:00Z", function_id: "define_api_contract", from: "delegate", to: "assist" }],
    });
    expect(logLines(withChange, "UTC")[0]).toMatchObject({ id: "m", time: "09:55", text: expect.stringContaining("changed their mode") });
  });
});

describe("logLines", () => {
  it("lists the newest first", () => {
    const lines = logLines(board, "UTC");
    expect(lines[0]).toMatchObject({ id: "e8", time: "09:41" });
    expect(lines.at(-1)!.id).toBe("e1");
  });
  it("is empty for an empty log", () => {
    expect(logLines(testBoard({ log: [] }))).toEqual([]);
  });
  it("takes the board log's filter, not another log's, and leaves the board's own log whole", () => {
    const filtered = testBoard({ log_filters: { ...board.log_filters, board: ["picked", "status_changed"], cycle: ["asked"], card: ["asked"] } });
    expect(BOARD_PANEL_LOG).toBe("board");
    expect(logLines(filtered, "UTC").map((l) => l.id)).toEqual(["e7", "e4", "e3"]);
    expect(filtered.log).toHaveLength(board.log.length);
  });
});
