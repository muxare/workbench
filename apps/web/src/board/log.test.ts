import { describe, expect, it } from "vitest";
import { describeEvent, formatTime, logLines } from "./log.ts";
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
    expect(line("e1")).toBe("SE picked #142 · mode: AI assists");
    expect(line("e3")).toBe("AI ran the structural check on #138 · passed: Invented: fine.");
    expect(line("e4")).toBe("SE posted a report on #138: Invented: report.");
    expect(line("e5")).toBe("SE moved #138 to Done");
    expect(line("e7")).toBe("AI asked PE on #151: Invented: page numbers or a cursor?");
    expect(line("e8")).toBe("AI moved #151 to Needs input · waiting on PE");
    expect(
      describeEvent({ id: "a", type: "answered", card_id: "c-151", actor: "t-be", at: "2026-11-06T09:50:00Z", question_id: "q-151", answer: "Invented: a cursor." }, board),
    ).toBe("PE answered on #151: Invented: a cursor.");
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
});
