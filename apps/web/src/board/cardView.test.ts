import { describe, expect, it } from "vitest";
import { cardAvatars, cardNotes, cardPill, cardTone, milestoneProgress, teammateNotes } from "./cardView.ts";
import { AI, BE, PO, UX, card, testBoard } from "./testBoard.ts";

const board = testBoard();
const byId = (id: string) => board.cards.find((c) => c.id === id)!;
const texts = (notes: { text: string }[]) => notes.map((n) => n.text);

describe("cardNotes", () => {
  it("says who a needs-input card waits on", () => {
    expect(cardNotes(byId("c-151"), board)).toEqual([{ text: "Waiting on a person: BE", tone: "needs-input", strong: true }]);
    const onAi = card("x", { status: { state: "needs_input", waiting_on: AI, question_id: "q" } });
    expect(texts(cardNotes(onAi, board))).toEqual(["Waiting on AI"]);
  });
  it("says what a card waits on outside the team, and who relays it", () => {
    const external = { artifact: "domain_rules", source: "Invented: caretaker's fault records" };
    const relayed = card("x", { status: { state: "needs_input", waiting_on: { ...external, relayed_by: PO }, question_id: "q-x" } });
    expect(cardNotes(relayed, board)).toEqual([
      { text: "Waiting on: domain_rules (Invented: caretaker's fault records)", tone: "needs-input", strong: true },
      { text: "Relayed by PO", tone: "muted" },
    ]);
    const b = testBoard({
      cards: [...board.cards, relayed],
      open_questions: [{ id: "q-x", card_id: "x", asked_by: AI, asked_of: PO, external, text: "Invented?", why_it_blocks: "Invented." }],
    });
    expect(texts(teammateNotes(PO, b))).toEqual(expect.arrayContaining(["1 question to relay outside the team", "Blocks x"]));
    expect(texts(teammateNotes(AI, b))).toContain("Waiting on domain_rules through PO for x");
  });
  it("says what blocks a ready card", () => {
    expect(texts(cardNotes(byId("c-152"), board))).toEqual(["Blocked by #151"]);
  });
  it("counts open questions on a card that is not waiting", () => {
    const b = testBoard({
      open_questions: [{ id: "q", card_id: "c-142", asked_by: AI, asked_of: UX, text: "Invented?", why_it_blocks: "Invented." }],
    });
    expect(texts(cardNotes(byId("c-142"), b))).toEqual(["1 open question"]);
  });
  it("says who verifies a delegated card in review", () => {
    expect(texts(cardNotes(byId("c-145"), board))).toEqual(["PO verifies"]);
  });
  it("shows the report and checks on a done card", () => {
    expect(cardNotes(byId("c-138"), board)).toEqual([{ text: "Report posted · checks 1/1", tone: "assist", strong: true }]);
    expect(cardTone(byId("c-138"), board)).toBe("assist");
  });
  it("says nothing about a plain backlog card", () => {
    expect(cardNotes(card("x"), board)).toEqual([]);
  });
});

describe("cardAvatars and cardPill", () => {
  it("show participants and mode only while a card is worked", () => {
    expect(cardAvatars(byId("c-142"), board)).toEqual([UX, AI]);
    expect(cardPill(byId("c-142"), board)).toBe("assist");
    expect(cardAvatars(byId("c-152"), board)).toEqual([]);
    expect(cardPill(byId("c-152"), board)).toBeUndefined();
    expect(cardAvatars(byId("c-138"), board)).toEqual([]);
  });
});

describe("milestoneProgress", () => {
  it("counts done cards of the most common milestone", () => {
    const m = "Invented milestone";
    expect(
      milestoneProgress([
        card("a", { milestone: m, status: { state: "done" } }),
        card("b", { milestone: m }),
        card("c", { milestone: "Other" }),
        card("d"),
      ]),
    ).toEqual({ name: m, done: 1, total: 2 });
  });
  it("is undefined without milestones", () => {
    expect(milestoneProgress([card("a")])).toBeUndefined();
  });
});

describe("teammateNotes", () => {
  it("tells the person asked that a question waits and what it blocks", () => {
    expect(texts(teammateNotes(BE, board))).toEqual(["Now: #151", "1 question waiting for me", "Blocks #151 and #152"]);
  });
  it("tells the AI whom it waits on, and lists no card it only assists on, waits on a person for or hands to review", () => {
    // #142 is in progress in assist (the person writes), #145 is in review, #151 waits on BE.
    expect(texts(teammateNotes(AI, board))).toEqual(["Waiting on BE for #151"]);
  });
  it("lists under Now only the cards in progress in a mode whose protocol has the AI write", () => {
    const writing = card("c-160", { function_id: "implement_services", owner: BE, status: { state: "in_progress" } });
    const assisting = card("c-161", { function_id: "implement_services", owner: BE, status: { state: "in_progress" } });
    const withThem = testBoard({
      cards: [...board.cards, writing, assisting],
      log: [
        ...board.log,
        { id: "e9", type: "picked", card_id: "c-160", actor: AI, at: "2026-11-06T09:50:00Z", mode: "delegate" },
        { id: "e10", type: "picked", card_id: "c-161", actor: AI, at: "2026-11-06T09:51:00Z", mode: "assist" },
      ],
    });
    expect(texts(teammateNotes(AI, withThem))).toEqual(["Now: #160", "Waiting on BE for #151"]);
    // The person who writes the assisted card still has it, and the one waiting, under Now.
    expect(texts(teammateNotes(BE, withThem))[0]).toBe("Now: #151 · #160 · #161");
  });
  it("tells an owner what to verify and what they finished", () => {
    expect(texts(teammateNotes(PO, board))).toEqual(["Next: verify #145"]);
    expect(texts(teammateNotes(UX, board))).toEqual(["Now: #142", "Just finished #138"]);
  });
  it("says so when someone has nothing on the board", () => {
    expect(texts(teammateNotes("nobody", board))).toEqual(["Nothing on the board right now"]);
  });
});
