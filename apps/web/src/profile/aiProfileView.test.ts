// INVENTED test data: the steps, cards and questions below are made up for
// the test and name no real function file, client or project.
import { describe, expect, it } from "vitest";
import type { AiTeammateProfileResponse, CardEvent } from "@workbench/shared";
import { AI, BE, PO, UX, card, testBoard } from "../board/testBoard.ts";
import {
  aiProfileRefreshKey,
  aiStepRows,
  nextItems,
  notNextItems,
  nowItems,
  ownerModeShares,
  pickCount,
  questionItems,
  recentLines,
  runFacts,
} from "./aiProfileView.ts";

const board = testBoard();

function profile(over: Partial<AiTeammateProfileResponse> = {}): AiTeammateProfileResponse {
  return {
    teammate: { kind: "ai", id: AI, name: "AI teammate (invented)" },
    works_in: ["assist"],
    provider: "stub",
    timer: null,
    steps: [
      {
        function_id: "shape_widget",
        role: "ux",
        title: "Invented shape the widget",
        summary: "Invented.",
        owners: [{ teammate_id: UX, mode: "assist", ai_may_pick: true, reason: null }],
      },
      {
        function_id: "plan_sprint",
        role: "team",
        title: "Invented plan the sprint",
        summary: "Invented.",
        owners: [
          { teammate_id: PO, mode: "delegate", ai_may_pick: false, reason: "invented: works only in assist" },
          { teammate_id: BE, mode: "manual", ai_may_pick: false, reason: "invented: not allowed" },
          { teammate_id: UX, mode: "assist", ai_may_pick: true, reason: null },
        ],
      },
    ],
    now: [
      { card: card("c-151", { owner: BE, status: { state: "needs_input", waiting_on: BE, question_id: "q-151" } }), mode: "assist" },
      { card: card("c-160", { status: { state: "review" } }), mode: "assist" },
    ],
    next: [
      { card: card("c-170", { owner: UX, status: { state: "ready" } }), mode: "assist" },
      { card: card("c-171", { owner: PO, status: { state: "ready" } }), mode: "assist" },
    ],
    not_next: [{ card: card("c-152", { status: { state: "ready" } }), reason: "depends on c-151, which is not done" }],
    questions: [
      { id: "q-151", card_id: "c-151", asked_by: AI, asked_of: BE, text: "Invented: cursor?", why_it_blocks: "Invented." },
      { id: "q-140", card_id: "c-140", asked_by: AI, asked_of: UX, text: "Invented: which list?", why_it_blocks: "Invented.", answer: "Invented: the short one.", decided_by: PO },
    ],
    recent: [{ id: "e6", type: "picked", card_id: "c-151", actor: AI, at: "2026-11-06T09:40:00Z", mode: "assist" }],
    ...over,
  };
}

describe("aiStepRows", () => {
  it("labels each owner by role and keeps why the AI may not pick", () => {
    const rows = aiStepRows(profile().steps, board);
    expect(rows.map((r) => r.subline)).toEqual(["ux · shape_widget", "team · plan_sprint"]);
    expect(rows[1]?.owners.map((o) => [o.label, o.mode, o.mayPick, o.reason])).toEqual([
      ["PO", "delegate", false, "invented: works only in assist"],
      ["BE", "manual", false, "invented: not allowed"],
      ["UX", "assist", true, undefined],
    ]);
  });
});

describe("ownerModeShares and pickCount", () => {
  it("counts each person on each step by mode, and where the AI may pick", () => {
    expect(ownerModeShares(profile().steps)).toEqual([
      { mode: "manual", count: 1, percent: 25 },
      { mode: "assist", count: 2, percent: 50 },
      { mode: "delegate", count: 1, percent: 25 },
    ]);
    expect(pickCount(profile().steps)).toEqual({ may: 2, total: 4 });
  });

  it("is empty without steps", () => {
    expect(ownerModeShares([]).every((s) => s.count === 0 && s.percent === 0)).toBe(true);
    expect(pickCount([])).toEqual({ may: 0, total: 0 });
  });
});

describe("runFacts", () => {
  it("names the modes it works in, those with an AI part it does not, and what starts a run", () => {
    expect(runFacts(profile())).toEqual({
      worksIn: "AI assists, I drive",
      notYet: "AI does it, I verify",
      runs: "Runs when someone starts it · stub provider",
    });
  });

  it("says when the timer runs it, and leaves out 'not yet' when every AI mode is built", () => {
    const facts = runFacts(profile({ works_in: ["assist", "delegate"], timer: { interval_ms: 5000 } }));
    expect(facts.notYet).toBeUndefined();
    expect(facts.runs).toBe("Runs on its own every 5 s · stub provider");
  });
});

describe("card lists", () => {
  it("shows whom a card in Needs input waits on, and the status otherwise", () => {
    expect(nowItems(profile(), board).map((c) => [c.ref, c.note, c.tone, c.href])).toEqual([
      ["#151", "Waiting on BE", "needs-input", "#/cards/c-151"],
      ["#160", "Review", "plain", "#/cards/c-160"],
    ]);
  });

  it("marks the card the next run takes", () => {
    expect(nextItems(profile(), board).map((c) => [c.id, c.note, c.tone])).toEqual([
      ["c-170", "Next run · owner UX", "plain"],
      ["c-171", "owner PO", "muted"],
    ]);
  });

  it("keeps the reason for a Ready card the AI may not pick", () => {
    expect(notNextItems(profile())).toEqual([
      { id: "c-152", ref: "#152", href: "#/cards/c-152", title: "Invented card c-152", reason: "depends on c-151, which is not done" },
    ]);
  });
});

describe("questionItems and recentLines", () => {
  it("says whom an open question waits on and who answered a closed one", () => {
    expect(questionItems(profile(), board).map((q) => [q.id, q.open, q.status])).toEqual([
      ["q-151", true, "Waiting on BE"],
      ["q-140", false, "PO answered: Invented: the short one."],
    ]);
  });

  it("words the AI's events as the cycle log does", () => {
    expect(recentLines(profile(), board, "UTC")).toEqual([
      { id: "e6", at: "2026-11-06T09:40:00Z", time: "09:40", text: "AI picked #151 · mode: AI assists" },
    ]);
  });
});

describe("aiProfileRefreshKey", () => {
  const key = aiProfileRefreshKey(board, AI);
  const withEvent = (e: CardEvent) => testBoard({ log: [...board.log, e], last_seq: board.last_seq + 1 });
  const base = { card_id: "c-142", at: "2026-11-06T10:00:00Z" };

  it("stays the same for the same board", () => {
    expect(aiProfileRefreshKey(testBoard(), AI)).toBe(key);
  });

  it("changes with a teammate, a card's status or owner, a pick, a question, an answer and any event of the AI's", () => {
    const teammates = board.teammates.map((t) => (t.kind === "human" && t.id === UX ? { ...t, process_profile: {} } : t));
    expect(aiProfileRefreshKey(testBoard({ teammates }), AI)).not.toBe(key);
    const moved = board.cards.map((c) => (c.id === "c-142" ? { ...c, status: { state: "review" as const } } : c));
    expect(aiProfileRefreshKey(testBoard({ cards: moved }), AI)).not.toBe(key);
    const handed = board.cards.map((c) => (c.id === "c-142" ? { ...c, owner: BE } : c));
    expect(aiProfileRefreshKey(testBoard({ cards: handed }), AI)).not.toBe(key);
    expect(aiProfileRefreshKey(withEvent({ ...base, id: "n1", actor: UX, type: "picked", mode: "manual" }), AI)).not.toBe(key);
    expect(aiProfileRefreshKey(withEvent({ ...base, id: "n2", actor: BE, type: "answered", question_id: "q-151", answer: "Invented." }), AI)).not.toBe(key);
    expect(aiProfileRefreshKey(withEvent({ ...base, id: "n3", actor: AI, type: "report_posted", text: "Invented." }), AI)).not.toBe(key);
  });

  it("ignores a check or a report by someone else", () => {
    expect(
      aiProfileRefreshKey(withEvent({ ...base, id: "n4", actor: UX, type: "check_ran", check: "structural", passed: true, summary: "Invented." }), AI),
    ).toBe(key);
    expect(aiProfileRefreshKey(withEvent({ ...base, id: "n5", actor: UX, type: "report_posted", text: "Invented." }), AI)).toBe(key);
  });
});
