import { describe, expect, it } from "vitest";
import type { HumanTeammate } from "@workbench/shared";
import {
  createdNote,
  creatorDefault,
  functionChoices,
  milestoneChoices,
  newCardDraft,
  ownerDefault,
  ownerShown,
  personChoices,
} from "./newCard.ts";
import { AI, BE, PO, UX, card, testBoard } from "./testBoard.ts";

// Invented data: no real client, project or person.
const FOUNDER: HumanTeammate = { kind: "human", id: "t-founder", name: "Invented founder", roles: ["po", "ux", "fe", "be"], process_profile: {} };
const FE: HumanTeammate = { kind: "human", id: "t-fe", name: "Invented frontend developer", roles: ["fe"], process_profile: {} };

describe("personChoices and creatorDefault", () => {
  it("lists every person on the team and leaves the AI teammate out", () => {
    const choices = personChoices(testBoard());
    expect(choices.map((c) => c.id)).toEqual([PO, UX, BE]);
    expect(choices[0]?.label).toBe("PO · Robin Example (invented product owner)");
  });

  it("creates as the person this browser chose last while they are on the team, else the product owner", () => {
    expect(creatorDefault(testBoard(), UX)).toBe(UX);
    expect(creatorDefault(testBoard(), undefined)).toBe(PO);
    expect(creatorDefault(testBoard(), "t-gone")).toBe(PO);
    expect(creatorDefault(testBoard(), AI)).toBe(PO);
  });

  it("has nobody to create as on a team with no person", () => {
    const board = testBoard();
    expect(creatorDefault({ ...board, teammates: board.teammates.filter((t) => t.kind === "ai") }, undefined)).toBeUndefined();
  });
});

describe("functionChoices", () => {
  it("offers the functions the board read from process/, in file order, with their role", () => {
    const choices = functionChoices(testBoard());
    expect(choices.map((c) => c.id)).toEqual(testBoard().functions.map((f) => f.name));
    expect(choices[0]).toEqual({ id: "define_api_contract", label: "define_api_contract · BE" });
  });
});

describe("ownerDefault", () => {
  it("is the one person whose role the function names", () => {
    expect(ownerDefault(testBoard(), "define_api_contract", PO)).toBe(BE);
    expect(ownerDefault(testBoard(), "frame_problem", PO)).toBe(UX);
  });

  it("is the creator before a function is chosen, for a team function, or when nobody holds the role", () => {
    expect(ownerDefault(testBoard(), undefined, UX)).toBe(UX);
    expect(ownerDefault(testBoard(), "fix_bug", UX)).toBe(UX);
    expect(ownerDefault(testBoard(), "refine_ui_spec", BE)).toBe(BE);
    expect(ownerDefault(testBoard(), "no_such_function", BE)).toBe(BE);
  });

  it("prefers the one person seated in the role over a person who also holds it", () => {
    const board = testBoard();
    const team = { ...board, teammates: [FOUNDER, FE, ...board.teammates] };
    expect(ownerDefault(team, "refine_ui_spec", PO)).toBe(FE.id);
    // Nobody but the founder holds fe as a secondary role and nobody is seated in it: the founder.
    expect(ownerDefault({ ...board, teammates: [FOUNDER, ...board.teammates] }, "refine_ui_spec", PO)).toBe(FOUNDER.id);
  });

  it("is the creator when two people are seated in the role", () => {
    const board = testBoard();
    const other: HumanTeammate = { ...FE, id: "t-fe-2", name: "Invented second frontend developer" };
    expect(ownerDefault({ ...board, teammates: [FE, other, ...board.teammates] }, "refine_ui_spec", UX)).toBe(UX);
  });
});

describe("ownerShown", () => {
  it("keeps the chosen owner while they are on the team, else shows the default", () => {
    expect(ownerShown(testBoard(), UX, BE)).toBe(UX);
    expect(ownerShown(testBoard(), undefined, BE)).toBe(BE);
    expect(ownerShown(testBoard(), "t-gone", BE)).toBe(BE);
    expect(ownerShown(testBoard(), AI, BE)).toBe(BE);
  });
});

describe("milestoneChoices", () => {
  it("offers each milestone the board's cards name once, in board order", () => {
    const board = testBoard({
      cards: [card("c-1", { milestone: "Invented B" }), card("c-2"), card("c-3", { milestone: "Invented A" }), card("c-4", { milestone: "Invented B" })],
    });
    expect(milestoneChoices(board)).toEqual(["Invented B", "Invented A"]);
    expect(milestoneChoices(testBoard({ cards: [card("c-1")] }))).toEqual([]);
  });
});

describe("newCardDraft", () => {
  const fields = { creator: PO, title: "  Invented: a card  ", functionId: "frame_problem", owner: UX, milestone: "" };

  it("builds the request with the title trimmed and no milestone when none is given", () => {
    expect(newCardDraft(fields)).toEqual({
      ok: true,
      request: { actor: PO, title: "Invented: a card", function_id: "frame_problem", owner: UX },
    });
  });

  it("sends a milestone trimmed", () => {
    const draft = newCardDraft({ ...fields, milestone: " Invented milestone " });
    expect(draft.ok && draft.request.milestone).toBe("Invented milestone");
  });

  it("says what is missing before anything is sent", () => {
    expect(newCardDraft({ ...fields, creator: undefined })).toEqual({ ok: false, reason: "Choose who creates the card." });
    expect(newCardDraft({ ...fields, title: "   " })).toEqual({ ok: false, reason: "Write a title first." });
    expect(newCardDraft({ ...fields, functionId: "" })).toEqual({ ok: false, reason: "Choose the function the card is worked as." });
    expect(newCardDraft({ ...fields, owner: undefined })).toEqual({ ok: false, reason: "Choose who owns the card." });
  });
});

describe("createdNote", () => {
  it("names the new card's number and links to it", () => {
    expect(createdNote("27")).toEqual({ text: "Created #27 in Backlog.", ref: "#27", href: "#/cards/27" });
  });
});
