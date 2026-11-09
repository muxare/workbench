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
  it("tells the AI what it works on and whom it waits on", () => {
    expect(texts(teammateNotes(AI, board))).toEqual(["Now: #142 · #145 · #151", "Waiting on BE for #151"]);
  });
  it("tells an owner what to verify and what they finished", () => {
    expect(texts(teammateNotes(PO, board))).toEqual(["Next: verify #145"]);
    expect(texts(teammateNotes(UX, board))).toEqual(["Now: #142", "Just finished #138"]);
  });
  it("says so when someone has nothing on the board", () => {
    expect(texts(teammateNotes("nobody", board))).toEqual(["Nothing on the board right now"]);
  });
});
