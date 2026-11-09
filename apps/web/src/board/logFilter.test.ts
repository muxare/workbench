// All example data here is invented.
import { describe, expect, it } from "vitest";
import { cardEventType, streamEventType } from "@workbench/shared";
import { defaultFilterEditor, filterEditors, filterOptions, filterSummary, toggleHidden } from "./logFilter.ts";
import { BE, PO, testBoard, UX } from "./testBoard.ts";

describe("filterOptions", () => {
  it("offers every event type in the schema, all shown, for a log nobody has filtered", () => {
    const options = filterOptions("board", []);
    expect(options.map((o) => o.type)).toEqual(streamEventType.options);
    expect(options.every((o) => o.shown)).toBe(true);
  });

  it("offers only card event types for the card log, marking the hidden ones", () => {
    const options = filterOptions("card", ["asked"]);
    expect(options.map((o) => o.type)).toEqual(cardEventType.options);
    expect(options.filter((o) => !o.shown).map((o) => o.type)).toEqual(["asked"]);
  });
});

describe("toggleHidden", () => {
  it("hides and shows one type, keeping the set in schema order", () => {
    expect(toggleHidden(["mode_changed"], "picked", false)).toEqual(["picked", "mode_changed"]);
    expect(toggleHidden(["picked", "mode_changed"], "picked", true)).toEqual(["mode_changed"]);
    expect(toggleHidden([], "picked", true)).toEqual([]);
  });
});

describe("filterSummary", () => {
  it("says all events until something the log can hold is hidden", () => {
    expect(filterSummary("board", [])).toBe("All events");
    expect(filterSummary("board", ["picked", "asked"])).toBe(`Hiding 2 of ${streamEventType.options.length}`);
    // A hidden type the card log can never hold does not count against it.
    expect(filterSummary("card", ["mode_changed"])).toBe("All events");
  });
});

describe("who changes a filter", () => {
  it("is any person on the board, the product owner by default", () => {
    const board = testBoard();
    expect(filterEditors(board).map((p) => p.id)).toEqual([PO, UX, BE]);
    expect(defaultFilterEditor(board)).toBe(PO);
    expect(defaultFilterEditor(testBoard({ teammates: board.teammates.filter((t) => t.id !== PO) }))).toBe(UX);
    expect(defaultFilterEditor(testBoard({ teammates: [] }))).toBeUndefined();
  });
});
