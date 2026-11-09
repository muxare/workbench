// Which screen `#/teammates/<id>` shows. INVENTED test data.
import { describe, expect, it } from "vitest";
import { AI, UX, testBoard } from "../board/testBoard.ts";
import { kindOnBoard, teammateScreen, type BoardPhase } from "./teammateScreen.ts";

const phases: BoardPhase[] = ["loading", "error", "ready"];

describe("teammateScreen", () => {
  it("shows a person's profile whatever the board's phase, so it never waits for the board", () => {
    for (const phase of phases) expect(teammateScreen(phase, "human")).toBe("human");
  });

  it("shows an AI teammate's profile once the board is ready, waits while it loads, and shows the board's error", () => {
    expect(teammateScreen("ready", "ai")).toBe("ai");
    expect(teammateScreen("loading", "ai")).toBe("wait");
    expect(teammateScreen("error", "ai")).toBe("board-error");
  });

  it("waits while the kind is being asked", () => {
    for (const phase of phases) expect(teammateScreen(phase, undefined)).toBe("wait");
  });

  it("lets the person's screen report an unknown id, as it did before", () => {
    for (const phase of phases) expect(teammateScreen(phase, "unknown")).toBe("human");
  });
});

describe("kindOnBoard", () => {
  it("reads the kind from a loaded board, and nothing for an id it does not list or no board", () => {
    const board = testBoard();
    expect(kindOnBoard(board, AI)).toBe("ai");
    expect(kindOnBoard(board, UX)).toBe("human");
    expect(kindOnBoard(board, "t-nobody")).toBeUndefined();
    expect(kindOnBoard(undefined, AI)).toBeUndefined();
  });
});
