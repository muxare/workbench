import { describe, expect, it } from "vitest";
import { cardStatus } from "@workbench/shared";
import { columnLabel, groupIntoColumns } from "./columns.ts";
import { card } from "./testBoard.ts";

describe("columnLabel", () => {
  it("uses the artboard's headings in the artboard's order", () => {
    expect(cardStatus.options.map(columnLabel)).toEqual(["Backlog", "Ready", "In progress", "Needs input", "Review", "Done"]);
  });
});

describe("groupIntoColumns", () => {
  it("returns every column, empty ones included, with cards in API order", () => {
    const cols = groupIntoColumns([
      card("a", { status: { state: "done" } }),
      card("b", { status: { state: "ready" } }),
      card("c", { status: { state: "done" } }),
    ]);
    expect(cols.map((c) => c.status)).toEqual(cardStatus.options);
    expect(cols.find((c) => c.status === "done")!.cards.map((c) => c.id)).toEqual(["a", "c"]);
    expect(cols.find((c) => c.status === "backlog")!.cards).toEqual([]);
  });

  it("puts a needs-input card in Needs input", () => {
    const cols = groupIntoColumns([card("x", { status: { state: "needs_input", waiting_on: "p", question_id: "q" } })]);
    expect(cols.find((c) => c.status === "needs_input")!.cards).toHaveLength(1);
  });
});
