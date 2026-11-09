import { describe, expect, it } from "vitest";
import { parseRoute, teammateHref } from "./route.ts";

describe("parseRoute", () => {
  it("reads a teammate's profile from the hash", () => {
    expect(parseRoute("#/teammates/invented-fe")).toEqual({ view: "teammate", teammateId: "invented-fe" });
    expect(parseRoute("#/teammates/invented-fe/")).toEqual({ view: "teammate", teammateId: "invented-fe" });
  });

  it("shows the board for an empty, unknown or malformed hash", () => {
    for (const hash of ["", "#", "#/", "#/cards/x", "#/teammates/", "#/teammates/a/b", "#/teammates/%E0%A4%A"]) {
      expect(parseRoute(hash)).toEqual({ view: "board" });
    }
  });

  it("round-trips an id through teammateHref", () => {
    const id = "invented person/1";
    expect(parseRoute(teammateHref(id))).toEqual({ view: "teammate", teammateId: id });
  });
});
