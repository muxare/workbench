// INVENTED test data: the board comes from testBoard.
import { describe, expect, it } from "vitest";
import type { BoardResponse, StreamEvent } from "@workbench/shared";
import { BOARD_LOG_LIMIT, liveBoard, mergeEvent } from "../api/boardState.ts";
import { BE, UX, testBoard } from "../board/testBoard.ts";
import { followLiveKey, profileLiveKey } from "./liveKey.ts";

const change = (id: string, teammate: string): StreamEvent => ({
  id,
  type: "mode_changed",
  teammate_id: teammate,
  actor: teammate,
  at: "2026-11-09T10:00:00Z",
  function_id: "define_api_contract",
  from: null,
  to: "assist",
});

const report = (id: string): StreamEvent => ({ id, type: "report_posted", card_id: "c-151", actor: UX, at: "2026-11-09T10:00:00Z", text: "Invented." });

/** Each board the stream produces, from a board whose log is already full, as useBoard would show them. */
function stream(events: StreamEvent[]): BoardResponse[] {
  const start = testBoard();
  const full = Array.from({ length: BOARD_LOG_LIMIT }, (_, i) => report(`r${i}`));
  let state = liveBoard({ ...start, log: [...full.slice(1), change("m0", BE)], last_seq: 100 });
  const boards = [state.board];
  events.forEach((event, i) => {
    state = mergeEvent(state, { seq: 101 + i, event });
    boards.push(state.board);
  });
  return boards;
}

/** How many times an open profile of `teammateId` would reload while following `boards`. */
function reloads(teammateId: string, boards: BoardResponse[]): number {
  let seen: string | undefined;
  let count = 0;
  for (const board of boards) {
    const next = followLiveKey(seen, profileLiveKey(teammateId, board));
    seen = next.seen;
    if (next.reload) count += 1;
  }
  return count;
}

describe("profileLiveKey", () => {
  it("is undefined with no board, and empty when the log holds no change for the person", () => {
    expect(profileLiveKey(BE, undefined)).toBeUndefined();
    expect(profileLiveKey(BE, testBoard())).toBe("");
  });

  it("is the id of the person's latest mode change", () => {
    const board = testBoard();
    expect(profileLiveKey(BE, { ...board, log: [...board.log, change("m1", BE), change("m2", UX)] })).toBe("m1");
  });
});

describe("following a full board log", () => {
  it("changes with a mode change for the person, and only then", () => {
    // 60 card events push the person's old change (m0) out of the 50-event log, then a new one arrives.
    const cardEvents = Array.from({ length: 60 }, (_, i) => report(`n${i}`));
    const boards = stream([...cardEvents, change("m1", UX), change("m2", BE)]);
    expect(boards.at(-3)!.log.some((e) => e.id === "m0")).toBe(false);
    expect(reloads(BE, boards)).toBe(1);
    expect(reloads(UX, boards)).toBe(1);
  });

  it("does not reload when the board first arrives or when nothing about the person changes", () => {
    expect(reloads(BE, stream(Array.from({ length: 60 }, (_, i) => report(`n${i}`))))).toBe(0);
    expect(followLiveKey(undefined, "")).toEqual({ seen: "", reload: false });
    expect(followLiveKey("", "m1")).toEqual({ seen: "m1", reload: true });
  });
});
