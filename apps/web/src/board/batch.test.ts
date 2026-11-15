import { describe, expect, it } from "vitest";
import type { Batch, BoardResponse } from "@workbench/shared";
import { batchChoice, batchMarker, handOver, keepSelectable, toggleSelected } from "./batch.ts";
import { AI, BE, card, PO, testBoard, UX } from "./testBoard.ts";

// Invented data: no real client, project or person.
const ready = { state: "ready" as const };

/** The test board with Ready cards to hand over: two of UX's, one of PO's, one UX works by hand, one owned by the AI. */
function batchBoard(over: Partial<BoardResponse> = {}): BoardResponse {
  const base = testBoard();
  return {
    ...base,
    cards: [
      ...base.cards,
      card("c-160", { status: ready }),
      card("c-161", { status: ready, links: [{ relation: "depends_on", card_id: "c-160" }] }),
      card("c-162", { function_id: "write_issues", owner: PO, status: ready }),
      card("c-163", { function_id: "fix_bug", status: ready }),
      card("c-164", { owner: AI, status: ready }),
      card("c-165", { status: { state: "in_progress" } }),
    ],
    ...over,
  };
}

function batch(over: Partial<Batch> = {}): Batch {
  return { id: "1", card_ids: ["c-160", "c-161"], released_card_ids: [], handed_to: AI, handed_by: UX, handed_at: "2026-11-06T10:00:00Z", state: "handed", plan: null, ...over };
}

describe("batchChoice", () => {
  const board = batchBoard({ batches: [batch({ card_ids: ["c-142", "c-165"], state: "handed" })] });
  const choice = (id: string, b = board) => batchChoice(b.cards.find((c) => c.id === id)!, b);

  it("lets a person tick a Ready card whose owner works it in a mode the AI works in", () => {
    expect(choice("c-160")).toEqual({ selectable: true });
    expect(choice("c-162")).toEqual({ selectable: true });
  });

  it("lets a card be ticked even when it waits on another card, which may join the batch", () => {
    expect(choice("c-161")).toEqual({ selectable: true });
    expect(choice("c-152")).toEqual({ selectable: true });
  });

  it("says why a card cannot be ticked", () => {
    expect(choice("c-163")).toEqual({ selectable: false, reason: "UX works it as “I do it”" });
    expect(choice("c-164")).toEqual({ selectable: false, reason: "Not owned by a person" });
    expect(choice("c-165")).toEqual({ selectable: false, reason: "Not in Ready" });
    const inBatch = batchBoard({ batches: [batch()] });
    expect(choice("c-160", inBatch)).toEqual({ selectable: false, reason: "Already in batch 1" });
  });

  it("lets a card in a finished batch be ticked again", () => {
    expect(choice("c-160", batchBoard({ batches: [batch({ state: "finished" })] }))).toEqual({ selectable: true });
  });

  it("reads the mode from the owner's process profile, not a fixed list of functions", () => {
    const manual = batchBoard({
      teammates: testBoard().teammates.map((t) => (t.id === PO && t.kind === "human" ? { ...t, process_profile: { write_issues: "manual" } } : t)),
    });
    expect(choice("c-162", manual)).toEqual({ selectable: false, reason: "PO works it as “I do it”" });
  });
});

describe("toggleSelected and keepSelectable", () => {
  it("ticks and unticks in the order the cards were ticked", () => {
    expect(toggleSelected([], "c-161")).toEqual(["c-161"]);
    expect(toggleSelected(["c-161"], "c-160")).toEqual(["c-161", "c-160"]);
    expect(toggleSelected(["c-161", "c-160"], "c-161")).toEqual(["c-160"]);
  });

  it("drops a ticked card that left Ready or joined a batch since", () => {
    const board = batchBoard({ batches: [batch({ card_ids: ["c-162", "c-152"] })] });
    expect(keepSelectable(["c-160", "c-162", "c-165", "c-999"], board)).toEqual(["c-160"]);
  });
});

describe("handOver", () => {
  const board = batchBoard();

  it("needs two or more cards", () => {
    expect(handOver([], board)).toEqual({ ready: false, hint: "Tick two or more Ready cards to hand them to the AI as one batch." });
    expect(handOver(["c-160"], board)).toEqual({ ready: false, hint: "Tick one more card: a batch has two or more." });
  });

  it("hands the cards over as their owner when they share one", () => {
    expect(handOver(["c-160", "c-161"], board)).toEqual({
      ready: true,
      actor: UX,
      handedTo: AI,
      hint: "Hands #160, #161 to AI as UX, their owner.",
    });
  });

  it("hands mixed owners' cards over as the owner of the first card ticked, and says so", () => {
    expect(handOver(["c-162", "c-160"], board)).toEqual({
      ready: true,
      actor: PO,
      handedTo: AI,
      hint: "Hands #162, #160 to AI as PO, owner of #162, the first card ticked.",
    });
  });

  it("counts a dependency inside the batch as covered, and refuses one outside it that is not done", () => {
    expect(handOver(["c-161", "c-162"], board)).toEqual({ ready: false, hint: "#161 waits on #160, which is not done and not in the batch." });
    expect(handOver(["c-152", "c-160"], board)).toEqual({ ready: false, hint: "#152 waits on #151, which is not done and not in the batch." });
  });

  it("needs an AI teammate to hand the cards to", () => {
    const noAi = batchBoard({ teammates: testBoard().teammates.filter((t) => t.kind !== "ai") });
    expect(handOver(["c-160", "c-161"], noAi)).toEqual({ ready: false, hint: "The team has no AI teammate to hand the cards to." });
  });
});

describe("batchMarker", () => {
  const marker = (b: BoardResponse, id: string) => batchMarker(b.cards.find((c) => c.id === id)!, b);

  it("marks a card in a batch without a plan as queued", () => {
    const board = batchBoard({ batches: [batch()] });
    expect(marker(board, "c-160")).toBe("Batch 1 · queued");
    expect(marker(board, "c-162")).toBeUndefined();
  });

  it("names the card's wave once the batch is planned", () => {
    const plan = {
      waves: [
        { card_ids: ["c-160"], note: "Invented: first." },
        { card_ids: ["c-161"], note: "Invented: after #160." },
      ],
      planned_by: AI,
      planned_at: "2026-11-06T10:05:00Z",
    };
    const board = batchBoard({ batches: [batch({ state: "planned", plan })] });
    expect(marker(board, "c-160")).toBe("Batch 1 · wave 1");
    expect(marker(board, "c-161")).toBe("Batch 1 · wave 2");
  });

  it("shows no marker on a card released from its batch, and lets it be ticked again", () => {
    const board = batchBoard({ batches: [batch({ card_ids: ["c-160", "c-161", "c-162"], released_card_ids: ["c-160"] })] });
    expect(marker(board, "c-160")).toBeUndefined();
    expect(marker(board, "c-161")).toBe("Batch 1 · queued");
    expect(batchChoice(board.cards.find((c) => c.id === "c-160")!, board)).toEqual({ selectable: true });
  });

  it("shows no marker for a finished batch", () => {
    expect(marker(batchBoard({ batches: [batch({ state: "finished" })] }), "c-160")).toBeUndefined();
  });

  it("is not about who handed it over", () => {
    expect(marker(batchBoard({ batches: [batch({ handed_by: BE })] }), "c-161")).toBe("Batch 1 · queued");
  });
});
