// The naming rules that link a card to its branch and pull request. The card
// titles here are invented.
import { describe, expect, it } from "vitest";
import { branchForCard, cardIdFromBody, cardIdFromBranch, pullRequestBodyLine } from "./workspace.ts";

describe("card names", () => {
  it("reads the card from a branch named wb/<card id>-<short title>", () => {
    expect(cardIdFromBranch("wb/2-github-webhooks")).toBe("2");
    expect(cardIdFromBranch("wb/12-x")).toBe("12");
    expect(cardIdFromBranch("wb/2")).toBeUndefined();
    expect(cardIdFromBranch("wb/two-x")).toBeUndefined();
    expect(cardIdFromBranch("feature/wb/2-x")).toBeUndefined();
  });

  it("reads the card from a body line Workbench: #<card id>", () => {
    expect(cardIdFromBody("Text.\n\nWorkbench: #2")).toBe("2");
    expect(cardIdFromBody("Workbench:#14 and more")).toBe("14");
    expect(cardIdFromBody("Fixes #2")).toBeUndefined();
    expect(cardIdFromBody(null)).toBeUndefined();
  });

  it("writes a body line the body rule reads back", () => {
    expect(cardIdFromBody(`Summary.\n\n${pullRequestBodyLine("7")}`)).toBe("7");
  });
});

describe("branchForCard", () => {
  it("suggests wb/<id>-<short title>, which names the card again", () => {
    const branch = branchForCard({ id: "4", title: "Build the MCP server in front of the REST API" });
    expect(branch).toBe("wb/4-build-the-mcp-server-in-front-of-the");
    expect(cardIdFromBranch(branch ?? "")).toBe("4");
  });

  it("cuts a long title at a word boundary and drops accents and punctuation", () => {
    const branch = branchForCard({ id: "12", title: "Invented: Café booking — rules, limits & fault reports for every laundry room" });
    expect(branch).toBe("wb/12-invented-cafe-booking-rules-limits-fault");
    expect((branch ?? "").length).toBeLessThanOrEqual("wb/12-".length + 40);
  });

  it("keeps something of a title whose first word is longer than the limit, or that has no letters", () => {
    expect(branchForCard({ id: "3", title: "a".repeat(60) })).toBe(`wb/3-${"a".repeat(40)}`);
    expect(branchForCard({ id: "3", title: "!!!" })).toBe("wb/3-work");
  });

  it("suggests nothing for a card whose id is not a plain number", () => {
    expect(branchForCard({ id: "invented-101", title: "Invented" })).toBeUndefined();
  });
});
