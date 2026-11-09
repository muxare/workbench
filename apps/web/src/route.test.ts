import { describe, expect, it } from "vitest";
import { cardHref, parseRoute } from "./route.ts";

describe("parseRoute", () => {
  it("reads a card id from #/cards/<id>", () => {
    expect(parseRoute("#/cards/invented-151")).toEqual({ view: "card", cardId: "invented-151" });
    expect(parseRoute("#/cards/invented-151/")).toEqual({ view: "card", cardId: "invented-151" });
  });

  it("round-trips an id that needs encoding", () => {
    expect(parseRoute(cardHref("a b/c"))).toEqual({ view: "card", cardId: "a b/c" });
  });

  it("falls back to the board for anything else", () => {
    for (const hash of ["", "#", "#/", "#/cards/", "#/teammates/x", "#/cards/%E0%A4%A"]) {
      expect(parseRoute(hash)).toEqual({ view: "board" });
    }
  });
});
