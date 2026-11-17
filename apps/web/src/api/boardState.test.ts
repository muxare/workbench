import { describe, expect, it } from "vitest";
import { defaultLogFilters, type BoardResponse, type CardEvent, type Mode, type StreamEventType, type Teammate } from "@workbench/shared";
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
  return { team: null, cards: [], teammates: [], functions: [], open_questions: [], log, log_filters: defaultLogFilters(), cycle: null, batches: [], last_seq: lastSeq };
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

describe("mergeEvent and the cycle log", () => {
  // Invented cycles around report()'s time, 2026-11-08T10:00Z.
  const holding = { id: "cy-now", name: "Invented sprint", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-16T08:00:00Z" };
  const over = { ...holding, id: "cy-over", starts_at: "2026-10-19T08:00:00Z", ends_at: "2026-11-02T08:00:00Z" };
  const inCycle = (c: typeof holding, log: CardEvent[] = []): BoardResponse => ({ ...board(3), cycle: { cycle: c, ended: false, log } });

  it("adds an event whose time falls in the current cycle to its log", () => {
    const next = mergeEvent(liveBoard(inCycle(holding, [report("e3")])), live(4));
    expect(next.board.cycle?.log.map((e) => e.id)).toEqual(["e3", "e4"]);
  });

  it("leaves the cycle log alone for an event after the cycle's end, or one it already holds", () => {
    const ended = mergeEvent(liveBoard(inCycle(over)), live(4));
    expect(ended.board.cycle?.log).toEqual([]);
    expect(ended.board.log.map((e) => e.id)).toEqual(["e4"]);
    const twice = mergeEvent(liveBoard(inCycle(holding, [report("e4")])), live(4));
    expect(twice.board.cycle?.log).toHaveLength(1);
  });

  it("keeps a board with no cycle at null", () => {
    expect(mergeEvent(liveBoard(board(3)), live(4)).board.cycle).toBeNull();
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

describe("a mode_changed event", () => {
  const person: Teammate = { kind: "human", id: "fe-1", name: "Invented developer", roles: ["fe"], process_profile: { refine_ui_spec: "assist" } };
  const ai: Teammate = { kind: "ai", id: "ai-1", name: "Invented AI" };
  const modeChanged = (seq: number, to: Mode, from: Mode | null, functionId = "refine_ui_spec"): LiveEvent => ({
    seq,
    event: { id: `m${seq}`, type: "mode_changed", teammate_id: "fe-1", actor: "fe-1", at: "2026-11-09T10:00:00.000Z", function_id: functionId, from, to },
  });
  const withTeam = (lastSeq: number): BoardResponse => ({ ...board(lastSeq, [report("e1")]), teammates: [person, ai] });

  it("parses from the stream, though it has no card", () => {
    const live = modeChanged(4, "manual", "assist");
    expect(parseStreamMessage(JSON.stringify(live.event), "4")).toEqual(live);
  });

  it("goes into the log and into the person's profile at once", () => {
    const next = mergeEvent(liveBoard(withTeam(3)), modeChanged(4, "manual", "assist"));
    expect(next.board.log.map((e) => e.id)).toEqual(["e1", "m4"]);
    expect(next.board.teammates).toEqual([{ ...person, process_profile: { refine_ui_spec: "manual" } }, ai]);
  });

  it("a roles_changed event replaces the person's roles at once", () => {
    const rolesChanged: LiveEvent = {
      seq: 4,
      event: { id: "r4", type: "roles_changed", teammate_id: "fe-1", actor: "fe-1", at: "2026-11-09T10:00:00.000Z", from: ["fe"], to: ["po", "fe"] },
    };
    expect(parseStreamMessage(JSON.stringify(rolesChanged.event), "4")).toEqual(rolesChanged);
    const next = mergeEvent(liveBoard(withTeam(3)), rolesChanged);
    expect(next.board.teammates).toEqual([{ ...person, roles: ["po", "fe"] }, ai]);
    expect(next.board.log.map((e) => e.id)).toEqual(["e1", "r4"]);
  });

  it("adds a function the person had left at its default, and leaves other teammates alone", () => {
    const next = mergeEvent(liveBoard(withTeam(3)), modeChanged(4, "delegate", null, "write_issues"));
    expect(next.board.teammates[0]).toEqual({ ...person, process_profile: { refine_ui_spec: "assist", write_issues: "delegate" } });
    expect(next.board.teammates[1]).toBe(ai);
  });

  it("is applied again over a refetch that started before it", () => {
    const state = mergeEvent(liveBoard(withTeam(3)), modeChanged(4, "manual", "assist"));
    const next = applyRefetch(state, withTeam(3));
    expect(next.board.teammates[0]).toEqual({ ...person, process_profile: { refine_ui_spec: "manual" } });
  });

  it("is not applied twice when replayed", () => {
    const state = mergeEvent(liveBoard(withTeam(3)), modeChanged(4, "manual", "assist"));
    expect(mergeEvent(state, modeChanged(4, "manual", "assist"))).toBe(state);
  });
});

describe("a log_filter_changed event", () => {
  const filterChanged = (seq: number, hidden: StreamEventType[], wasHidden: StreamEventType[] = []): LiveEvent => ({
    seq,
    event: { id: `f${seq}`, type: "log_filter_changed", actor: "fe-1", at: "2026-11-09T10:00:00.000Z", log: "board", hidden, was_hidden: wasHidden },
  });

  it("parses from the stream, though it has neither a card nor a teammate", () => {
    const live = filterChanged(4, ["mode_changed"]);
    expect(parseStreamMessage(JSON.stringify(live.event), "4")).toEqual(live);
  });

  it("goes into the log and replaces its log's filter at once, leaving the other logs alone", () => {
    const next = mergeEvent(liveBoard(board(3, [report("e1")])), filterChanged(4, ["mode_changed", "picked"]));
    expect(next.board.log.map((e) => e.id)).toEqual(["e1", "f4"]);
    expect(next.board.log_filters).toEqual({ ...defaultLogFilters(), board: ["mode_changed", "picked"] });
    const after = mergeEvent(next, filterChanged(5, [], ["mode_changed", "picked"]));
    expect(after.board.log_filters).toEqual(defaultLogFilters());
  });

  it("is applied again over a refetch that started before it", () => {
    const state = mergeEvent(liveBoard(board(3)), filterChanged(4, ["asked"]));
    expect(applyRefetch(state, board(3)).board.log_filters.board).toEqual(["asked"]);
  });

  it("keeps every event in the board's log, hidden or not", () => {
    const state = mergeEvent(liveBoard(board(3)), filterChanged(4, ["report_posted"]));
    const next = mergeEvent(state, live(5));
    expect(next.board.log.map((e) => e.id)).toEqual(["f4", "e5"]);
  });
});

describe("a team_named event", () => {
  const named = (seq: number, headline?: string): LiveEvent => ({
    seq,
    event: {
      id: `n${seq}`,
      type: "team_named",
      actor: "fe-1",
      at: "2026-11-09T10:00:00.000Z",
      from: null,
      to: headline === undefined ? { name: "Invented team" } : { name: "Invented team", headline },
    },
  });

  it("renames the board at once and goes into the log", () => {
    const next = mergeEvent(liveBoard(board(3)), named(4, "Invented headline"));
    expect(next.board.team).toEqual({ name: "Invented team", headline: "Invented headline" });
    expect(next.board.log.map((e) => e.id)).toEqual(["n4"]);
  });

  it("is applied again over a refetch that started before it", () => {
    const state = mergeEvent(liveBoard(board(3)), named(4));
    expect(applyRefetch(state, board(3)).board.team).toEqual({ name: "Invented team" });
  });
});

describe("batch events", () => {
  const handed = (seq: number): LiveEvent => ({
    seq,
    event: { id: `h${seq}`, type: "batch_handed", actor: "fe-1", at: "2026-11-09T10:00:00.000Z", batch_id: "1", card_ids: ["c-16", "c-17"], handed_to: "ai-1" },
  });
  const planned = (seq: number): LiveEvent => ({
    seq,
    event: {
      id: `p${seq}`,
      type: "batch_planned",
      actor: "ai-1",
      at: "2026-11-09T10:05:00.000Z",
      batch_id: "1",
      waves: [
        { card_ids: ["c-16"], note: "Invented: first." },
        { card_ids: ["c-17"], note: "Invented: after #16." },
      ],
    },
  });

  it("adds a handed batch to the open batches at once, without a plan", () => {
    const next = mergeEvent(liveBoard(board(3)), handed(4));
    expect(next.board.batches).toEqual([
      { id: "1", card_ids: ["c-16", "c-17"], released_card_ids: [], handed_to: "ai-1", handed_by: "fe-1", handed_at: "2026-11-09T10:00:00.000Z", state: "handed", plan: null },
    ]);
    expect(next.board.log.map((e) => e.id)).toEqual(["h4"]);
  });

  it("adds the plan to its batch, and only the first plan counts", () => {
    const next = mergeEvent(mergeEvent(liveBoard(board(3)), handed(4)), planned(5));
    expect(next.board.batches[0]?.state).toBe("planned");
    expect(next.board.batches[0]?.plan).toEqual({
      waves: [
        { card_ids: ["c-16"], note: "Invented: first." },
        { card_ids: ["c-17"], note: "Invented: after #16." },
      ],
      planned_by: "ai-1",
      planned_at: "2026-11-09T10:05:00.000Z",
    });
    const again = mergeEvent(next, { ...planned(6), event: { ...planned(6).event, id: "p6-again", at: "2026-11-09T11:00:00.000Z" } });
    expect(again.board.batches[0]?.plan?.planned_at).toBe("2026-11-09T10:05:00.000Z");
  });

  it("releases a card moved back to Backlog from its batch", () => {
    const back: LiveEvent = {
      seq: 5,
      event: { id: "s5", type: "status_changed", card_id: "c-17", actor: "fe-1", at: "2026-11-09T10:10:00.000Z", from: "ready", to: { state: "backlog" } },
    };
    const next = mergeEvent(mergeEvent(liveBoard(board(3)), handed(4)), back);
    expect(next.board.batches[0]?.released_card_ids).toEqual(["c-17"]);
  });

  it("releases a withdrawn card from its batch", () => {
    const withdrawn: LiveEvent = {
      seq: 5,
      event: { id: "w5", type: "card_withdrawn", card_id: "c-16", actor: "fe-1", at: "2026-11-09T10:10:00.000Z", reason: "Invented: not needed", from: "ready" },
    };
    const next = mergeEvent(mergeEvent(liveBoard(board(3)), handed(4)), withdrawn);
    expect(next.board.batches[0]?.released_card_ids).toEqual(["c-16"]);
  });

  it("ignores a plan for a batch the board does not hold", () => {
    expect(mergeEvent(liveBoard(board(3)), planned(4)).board.batches).toEqual([]);
  });

  it("is applied again over a refetch that started before it", () => {
    const state = mergeEvent(liveBoard(board(3)), handed(4));
    expect(applyRefetch(state, board(3)).board.batches.map((b) => b.id)).toEqual(["1"]);
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
