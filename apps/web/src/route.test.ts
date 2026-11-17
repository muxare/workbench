import { describe, expect, it } from "vitest";
import { cardHref, parseRoute, teamHref, teammateHref } from "./route.ts";

describe("parseRoute", () => {
  it("reads a card id from #/cards/<id>", () => {
    expect(parseRoute("#/cards/invented-151")).toEqual({ view: "card", cardId: "invented-151" });
    expect(parseRoute("#/cards/invented-151/")).toEqual({ view: "card", cardId: "invented-151" });
  });

  it("reads a teammate's profile from the hash", () => {
    expect(parseRoute("#/teammates/invented-fe")).toEqual({ view: "teammate", teammateId: "invented-fe" });
    expect(parseRoute("#/teammates/invented-fe/")).toEqual({ view: "teammate", teammateId: "invented-fe" });
  });

  it("reads the team screen from #/team", () => {
    expect(parseRoute(teamHref)).toEqual({ view: "team" });
    expect(parseRoute("#/team/")).toEqual({ view: "team" });
  });

  it("round-trips ids that need encoding", () => {
    expect(parseRoute(cardHref("a b/c"))).toEqual({ view: "card", cardId: "a b/c" });
    const id = "invented person/1";
    expect(parseRoute(teammateHref(id))).toEqual({ view: "teammate", teammateId: id });
  });

  it("falls back to the board for anything else", () => {
    for (const hash of [
      "",
      "#",
      "#/",
      "#/cards/",
      "#/teammates/",
      "#/teammates/a/b",
      "#/other/x",
      "#/team/x",
      "#/teams",
      "#/cards/%E0%A4%A",
      "#/teammates/%E0%A4%A",
    ]) {
      expect(parseRoute(hash)).toEqual({ view: "board" });
    }
  });
});
