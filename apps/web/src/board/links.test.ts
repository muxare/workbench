import { describe, expect, it } from "vitest";
import { cardMode, cardParticipants, linksFor } from "./links.ts";
import { AI, BE, PO, UX, card, testBoard } from "./testBoard.ts";

const board = testBoard();
const byId = (id: string) => board.cards.find((c) => c.id === id)!;

describe("cardMode", () => {
  it("takes the mode of the latest pick", () => {
    expect(cardMode(byId("c-145"), board)).toBe("delegate");
  });
  it("falls back to the owner's profile, then to unknown", () => {
    expect(cardMode(card("x", { function_id: "fix_bug" }), board)).toBe("manual");
    expect(cardMode(card("y", { function_id: "nothing_set" }), board)).toBeUndefined();
  });
});

describe("cardParticipants", () => {
  it("puts the owner first and the AI second in assist", () => {
    expect(cardParticipants(byId("c-142"), board)).toEqual([UX, AI]);
  });
  it("puts the AI first and the owner second in delegate", () => {
    expect(cardParticipants(byId("c-145"), board)).toEqual([AI, PO]);
  });
  it("leaves the AI off a manual card", () => {
    expect(cardParticipants(card("x", { function_id: "fix_bug", status: { state: "in_progress" } }), board)).toEqual([UX]);
  });
});

describe("linksFor", () => {
  it("draws a solid line from the AI to every active card it is on", () => {
    const works = linksFor(AI, board).find((l) => l.kind === "works")!;
    expect(works.cardIds).toEqual(["c-142", "c-145", "c-151"]);
    expect(works.label).toBe("works on #142 · #145 · #151");
  });

  it("draws a dashed line from the asker, with the arrow at the person asked", () => {
    expect(linksFor(AI, board).filter((l) => l.kind === "asks")).toEqual([
      { kind: "asks", arrow: "none", cardIds: ["c-151"], label: "asks PE on #151: Invented: page numbers or a cursor?" },
    ]);
    expect(linksFor(BE, board).filter((l) => l.kind === "asks")).toEqual([
      { kind: "asks", arrow: "teammate", cardIds: ["c-151"], label: "AI asks on #151" },
    ]);
  });

  it("draws a dotted line for a report and for an answer", () => {
    expect(linksFor(UX, board).filter((l) => l.kind === "reports").map((l) => l.label)).toEqual(["reported #138 done"]);
    const answered = testBoard({
      log: [{ id: "a", type: "answered", card_id: "c-142", actor: UX, at: "2026-11-06T09:52:00Z", question_id: "q", answer: "Invented." }],
    });
    expect(linksFor(UX, answered).find((l) => l.kind === "reports")!.label).toBe("answered #142");
  });

  it("gives a teammate with nothing on the board no lines", () => {
    expect(linksFor("nobody", board)).toEqual([]);
  });
});
