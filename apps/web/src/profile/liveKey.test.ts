// INVENTED test data: the board comes from testBoard.
import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@workbench/shared";
import { BE, UX, testBoard } from "../board/testBoard.ts";
import { profileLiveKey } from "./liveKey.ts";

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

describe("profileLiveKey", () => {
  const board = testBoard();

  it("is undefined with no board", () => {
    expect(profileLiveKey(BE, undefined)).toBeUndefined();
  });

  it("changes with a mode change for the person, and only then", () => {
    const key = profileLiveKey(BE, board);
    expect(profileLiveKey(BE, { ...board, log: [...board.log, change("m1", UX)] })).toBe(key);
    expect(profileLiveKey(BE, { ...board, log: [...board.log, change("m2", BE)] })).not.toBe(key);
  });
});
