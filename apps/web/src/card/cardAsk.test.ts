import { describe, expect, it } from "vitest";
import type { CardResponse, Question } from "@workbench/shared";
import { AI, BE, PO, UX, card, testBoard } from "../board/testBoard.ts";
import { askDraft, askedOfChoices, askedOfDefault, askHint, askView } from "./cardAsk.ts";

// Invented data: no real client, project or function file.
function detail(over: Partial<CardResponse["card"]> = {}, questions: Question[] = []): CardResponse {
  return {
    card: card("c-160", { function_id: "define_api_contract", owner: BE, status: { state: "in_progress" }, ...over }),
    log: [],
    questions,
    function: null,
  };
}

const open: Question = { id: "q-1", card_id: "c-160", asked_by: AI, asked_of: BE, text: "Invented?", why_it_blocks: "Invented." };

describe("askView", () => {
  it("offers the form on a card in progress with no open question, asked as the owner by default", () => {
    const view = askView(detail(), testBoard(), undefined);
    expect(view).toMatchObject({ kind: "ask", asker: BE });
    expect(view.kind === "ask" && view.askers.map((p) => p.id)).toEqual([PO, UX, BE]);
  });

  it("asks as the person this browser chose last while they are on the team", () => {
    expect(askView(detail(), testBoard(), UX)).toMatchObject({ kind: "ask", asker: UX });
    expect(askView(detail(), testBoard(), "t-gone")).toMatchObject({ kind: "ask", asker: BE });
    expect(askView(detail(), testBoard(), AI)).toMatchObject({ kind: "ask", asker: BE });
  });

  it("falls back to the product owner when an AI teammate owns the card", () => {
    expect(askView(detail({ owner: AI }), testBoard(), undefined)).toMatchObject({ kind: "ask", asker: PO });
  });

  it("offers nothing on a card that is not in progress", () => {
    for (const status of [{ state: "ready" }, { state: "review" }, { state: "done" }, { state: "backlog" }] as const) {
      expect(askView(detail({ status }), testBoard(), undefined)).toEqual({ kind: "none" });
    }
    const waiting = { state: "needs_input", waiting_on: BE, question_id: "q-1" } as const;
    expect(askView(detail({ status: waiting }, [open]), testBoard(), undefined)).toEqual({ kind: "none" });
  });

  it("offers nothing while a question is open, and again once it is answered", () => {
    expect(askView(detail({}, [open]), testBoard(), undefined)).toEqual({ kind: "none" });
    const answered = { ...open, answer: "Invented answer.", decided_by: BE };
    expect(askView(detail({}, [answered]), testBoard(), undefined)).toMatchObject({ kind: "ask" });
  });
});

describe("askedOfChoices", () => {
  it("offers every person but the asker, the owner first, and never the AI teammate", () => {
    expect(askedOfChoices(testBoard(), BE, PO).map((p) => p.id)).toEqual([BE, UX]);
    expect(askedOfChoices(testBoard(), BE, BE).map((p) => p.id)).toEqual([PO, UX]);
  });

  it("labels each person by role and name", () => {
    expect(askedOfChoices(testBoard(), BE, PO)[0]).toEqual({ id: BE, label: "BE · Pat Example" });
  });
});

describe("askedOfDefault", () => {
  const choices = [
    { id: BE, label: "BE" },
    { id: UX, label: "UX" },
  ];
  it("keeps the choice while it is offered, else takes the first", () => {
    expect(askedOfDefault(choices, UX)).toBe(UX);
    expect(askedOfDefault(choices, PO)).toBe(BE);
    expect(askedOfDefault(choices, undefined)).toBe(BE);
    expect(askedOfDefault([], undefined)).toBeUndefined();
  });
});

describe("askHint", () => {
  it("says the card will wait on the person asked", () => {
    expect(askHint(testBoard(), BE)).toBe("The card moves to Needs input and waits on Pat Example (BE) until they answer.");
    expect(askHint(testBoard(), undefined)).toBe("There is no one else on the team to ask.");
  });
});

describe("askDraft", () => {
  it("builds the request with trimmed text", () => {
    expect(askDraft(PO, BE, "  Which paging?  ", " The list cannot be built. ")).toEqual({
      ok: true,
      request: { actor: PO, asked_of: BE, text: "Which paging?", why_it_blocks: "The list cannot be built." },
    });
  });

  it("says what is missing", () => {
    expect(askDraft(PO, undefined, "q", "w")).toEqual({ ok: false, reason: "Choose whom to ask." });
    expect(askDraft(PO, BE, "  ", "w")).toEqual({ ok: false, reason: "Write the question first." });
    expect(askDraft(PO, BE, "q", " ")).toEqual({ ok: false, reason: "Say why the question blocks the work." });
  });
});
