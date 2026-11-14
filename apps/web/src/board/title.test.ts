// INVENTED test data; no real team is named here.
import { describe, expect, it } from "vitest";
import { boardTitle, UNNAMED_BOARD_TITLE } from "./title.ts";

describe("the board title", () => {
  it("is the team's headline when it has one", () => {
    expect(boardTitle({ team: { name: "Invented team", headline: "Invented headline" } })).toBe("Invented headline");
  });

  it("is the team's name when it has no headline", () => {
    expect(boardTitle({ team: { name: "Invented team" } })).toBe("Invented team");
  });

  it("falls back to a plain word when the team was never named", () => {
    expect(boardTitle({ team: null })).toBe(UNNAMED_BOARD_TITLE);
  });
});
