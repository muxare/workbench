import { describe, expect, it } from "vitest";
import type { BoardResponse, CardEvent } from "@workbench/shared";
import {
  BOARD_LOG_LIMIT,
  applyRefetch,
  idleRefetch,
  liveBoard,
  mergeEvent,
  parseStreamMessage,
  reconnectDelay,
  refetchSettled,
  requestRefetch,
  type LiveEvent,
} from "./boardState.ts";

// Invented data: no real client or project.
function report(id: string): CardEvent {
  return { id, card_id: "card-1", actor: "ai-1", at: "2026-11-08T10:00:00.000Z", type: "report_posted", text: `report ${id}` };
}

function board(lastSeq: number, log: CardEvent[] = []): BoardResponse {
  return { cards: [], teammates: [], open_questions: [], log, last_seq: lastSeq };
}

const live = (seq: number, id = `e${seq}`): LiveEvent => ({ seq, event: report(id) });

describe("parseStreamMessage", () => {
  it("reads the event from data and its seq from the SSE id", () => {
    expect(parseStreamMessage(JSON.stringify(report("e7")), "7")).toEqual({ seq: 7, event: report("e7") });
  });

  it("drops a message without a numeric id or with a body that is not an event", () => {
    expect(parseStreamMessage(JSON.stringify(report("e7")), "")).toBeUndefined();
    expect(parseStreamMessage("not json", "7")).toBeUndefined();
    expect(parseStreamMessage(JSON.stringify({ type: "unknown" }), "7")).toBeUndefined();
  });
});

describe("mergeEvent", () => {
  it("appends a new event to the log and moves last_seq", () => {
    const next = mergeEvent(liveBoard(board(3, [report("e3")])), live(4));
    expect(next.board.log.map((e) => e.id)).toEqual(["e3", "e4"]);
    expect(next.board.last_seq).toBe(4);
    expect(next.pending).toEqual([live(4)]);
  });

  it("ignores a replayed event at or before last_seq, keeping the same reference", () => {
    const state = liveBoard(board(5, [report("e5")]));
    expect(mergeEvent(state, live(5))).toBe(state);
    expect(mergeEvent(state, live(2))).toBe(state);
  });

  it("does not log an event id twice", () => {
    const state = liveBoard(board(3, [report("e4")]));
    const next = mergeEvent(state, live(4));
    expect(next.board.log).toHaveLength(1);
    expect(next.board.last_seq).toBe(4);
  });

  it("keeps the log at the API's length", () => {
    let state = liveBoard(board(0));
    for (let seq = 1; seq <= BOARD_LOG_LIMIT + 5; seq++) state = mergeEvent(state, live(seq));
    expect(state.board.log).toHaveLength(BOARD_LOG_LIMIT);
    expect(state.board.log[0]?.id).toBe("e6");
  });
});

describe("applyRefetch", () => {
  it("takes the fetched board and drops pending events it already includes", () => {
    let state = liveBoard(board(1, [report("e1")]));
    state = mergeEvent(state, live(2));
    state = mergeEvent(state, live(3));
    const fetched = board(3, [report("e1"), report("e2"), report("e3")]);
    const next = applyRefetch(state, fetched);
    expect(next.board).toBe(fetched);
    expect(next.pending).toEqual([]);
  });

  it("re-applies streamed events newer than a fetch that started before them", () => {
    let state = liveBoard(board(1, [report("e1")]));
    state = mergeEvent(state, live(2));
    state = mergeEvent(state, live(3));
    const next = applyRefetch(state, board(2, [report("e1"), report("e2")]));
    expect(next.board.log.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(next.board.last_seq).toBe(3);
    expect(next.pending).toEqual([live(3)]);
  });
});

describe("refetch coalescing", () => {
  it("starts one fetch for a burst and owes exactly one more", () => {
    let s = idleRefetch;
    const first = requestRefetch(s);
    expect(first.start).toBe(true);
    s = first.state;
    for (let i = 0; i < 4; i++) {
      const again = requestRefetch(s);
      expect(again.start).toBe(false);
      s = again.state;
    }
    const followUp = refetchSettled(s);
    expect(followUp.start).toBe(true);
    const done = refetchSettled(followUp.state);
    expect(done.start).toBe(false);
    expect(done.state).toEqual(idleRefetch);
  });
});

describe("reconnectDelay", () => {
  it("backs off and caps at 30 seconds", () => {
    expect(reconnectDelay(0)).toBe(1_000);
    expect(reconnectDelay(3)).toBe(8_000);
    expect(reconnectDelay(20)).toBe(30_000);
  });
});
