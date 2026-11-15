import { describe, expect, it } from "vitest";
import type { CardResponse, FunctionFrontMatter } from "@workbench/shared";
import { AI, BE, card, testBoard } from "../board/testBoard.ts";
import { cardMoves, pickHint, pickSteps } from "./cardMoves.ts";

// Invented data: no real client, project or function file.
const fn: FunctionFrontMatter = {
  template: 1,
  name: "define_api_contract",
  role: "be",
  title: "Invented: define the contract",
  summary: "Invented summary.",
  inputs: [{ artifact: "refined_ui_spec", required: true, from: "refine_ui_spec" }],
  context: [],
  outputs: [{ artifact: "api_contract" }],
  checks: {
    structural: [{ id: "s1", rule: "Invented rule." }],
    consistency: [{ id: "c1", rule: "Invented rule." }],
    human: { approver: "invented approver", where: "invented place", criteria: "Invented criteria." },
  },
  modes: { default: "assist", allowed: ["manual", "assist", "delegate"] },
  protocols: {
    manual: { opens: "human", asks: "none", writes: "human", decides: "human" },
    assist: { opens: "human", asks: "ai", writes: "human", decides: "human" },
    delegate: { opens: "human", asks: "both", writes: "ai", decides: "human" },
  },
  decision_log: [],
  writes_back: [],
};

function detail(over: Partial<CardResponse["card"]> = {}, f: FunctionFrontMatter | null = fn): CardResponse {
  return { card: card("c-160", { function_id: "define_api_contract", owner: BE, ...over }), log: [], questions: [], function: f };
}

describe("cardMoves", () => {
  it("offers Move to Ready on a Backlog card, as its owner", () => {
    expect(cardMoves(detail(), testBoard())).toEqual({ kind: "open", actor: BE });
  });

  it("offers a pick on a Ready card, preset to the owner's mode for the function", () => {
    const view = cardMoves(detail({ status: { state: "ready" } }), testBoard());
    expect(view).toEqual({
      kind: "pick",
      actor: BE,
      functionId: "define_api_contract",
      allowed: ["manual", "assist", "delegate"],
      current: "assist",
      blocked: undefined,
    });
  });

  it("presets the function's default when the owner has chosen no mode", () => {
    const board = testBoard();
    const be = board.teammates.find((t) => t.id === BE)!;
    if (be.kind === "human") be.process_profile = {};
    const view = cardMoves(detail({ status: { state: "ready" } }, { ...fn, modes: { default: "delegate", allowed: ["assist", "delegate"] } }), board);
    expect(view).toMatchObject({ kind: "pick", current: "delegate", allowed: ["assist", "delegate"] });
  });

  it("blocks the pick, not the move back, while a dependency is not done", () => {
    const view = cardMoves(detail({ status: { state: "ready" }, links: [{ relation: "depends_on", card_id: "c-151" }] }), testBoard());
    expect(view).toMatchObject({ kind: "pick", blocked: "Waits on #151, which is not done." });
  });

  it("offers nothing once work has started, or on a card an AI teammate owns", () => {
    for (const state of ["in_progress", "review", "done"] as const) {
      expect(cardMoves(detail({ status: { state } }), testBoard())).toEqual({ kind: "none" });
    }
    expect(cardMoves(detail({ owner: AI }), testBoard())).toEqual({ kind: "none" });
  });

  it("offers no pick when process/ no longer defines the function", () => {
    expect(cardMoves(detail({ status: { state: "ready" } }, null), testBoard())).toEqual({ kind: "none" });
  });
});

describe("pickSteps and pickHint", () => {
  const view = cardMoves(detail({ status: { state: "ready" } }), testBoard());
  if (view.kind !== "pick") throw new Error("expected a pick");

  it("only picks when the choice is the owner's mode", () => {
    expect(pickSteps(view, "assist")).toEqual(["pick"]);
    expect(pickHint(view, "assist")).toBe("Picks the card in your mode for define_api_contract: “AI assists, I drive”.");
  });

  it("changes the owner's mode first when the choice differs", () => {
    expect(pickSteps(view, "delegate")).toEqual(["set_mode", "pick"]);
    expect(pickHint(view, "delegate")).toBe("Sets your mode for define_api_contract to “AI does it, I verify”, then picks the card.");
  });
});
