import { describe, expect, it } from "vitest";
import type { CardStatus } from "@workbench/shared";
import { findDrift, formatDrift, logsNeeded, type BoardCard, type GhPullRequest } from "./lanes.ts";

const card = (id: string, state: CardStatus): BoardCard => ({ id, title: `Card ${id}`, status: { state } });
const pr = (number: number, headRefName: string, state: GhPullRequest["state"], rest: Partial<GhPullRequest> = {}): GhPullRequest => ({
  number,
  state,
  isDraft: false,
  headRefName,
  body: null,
  ...rest,
});

// The drift seen on 2026-11-16 and 2026-11-17: card #16 stayed in progress after its pull
// request #11 merged, and #17 and #18 stayed ready while #14 and #15 were open.
const prs = [
  pr(11, "wb/16-record-a-batch-of-cards-handed-to-the-ai", "MERGED"),
  pr(14, "wb/17-let-a-person-select-several-ready-cards", "OPEN"),
  pr(15, "wb/18-add-list-batches-get-batch-and-plan", "OPEN"),
];
const branches = ["main", "wb/17-let-a-person-select-several-ready-cards", "wb/18-add-list-batches-get-batch-and-plan"];

describe("findDrift", () => {
  it("finds card #16 in progress although its pull request merged", () => {
    const { mismatches } = findDrift([card("16", "in_progress")], prs, branches);
    expect(mismatches).toEqual([
      expect.objectContaining({
        card_id: "16",
        board: "in_progress",
        expected: "done",
        evidence: { kind: "pull_request", number: 11, state: "merged", branch: "wb/16-record-a-batch-of-cards-handed-to-the-ai" },
        hint: "move in_progress → review → done; check the approval first",
      }),
    ]);
  });

  it("finds cards #17 and #18 ready while their pull requests are open", () => {
    const { checked, mismatches } = findDrift([card("18", "ready"), card("17", "ready")], prs, branches);
    expect(checked).toBe(2);
    expect(mismatches.map((m) => [m.card_id, m.board, m.expected, m.hint])).toEqual([
      ["17", "ready", "review", "pick, then move to review"],
      ["18", "ready", "review", "pick, then move to review"],
    ]);
  });

  it("finds nothing once #16 is done and #17 and #18 are in review", () => {
    const report = findDrift([card("16", "done"), card("17", "review"), card("18", "review")], prs, branches);
    expect(report).toEqual({ checked: 3, mismatches: [] });
    expect(formatDrift(report)).toBe("lanes: the board matches GitHub for all 3 cards GitHub names.");
  });

  it("skips cards GitHub says nothing about, and pull requests closed without merging", () => {
    const report = findDrift(
      [card("1", "backlog"), card("2", "ready")],
      [pr(3, "wb/2-abandoned", "CLOSED"), pr(4, "feat/other", "MERGED")],
      ["main", "wb/2-abandoned", "feat/other"],
    );
    expect(report).toEqual({ checked: 0, mismatches: [] });
  });

  it("lets the body line win over the branch", () => {
    const named = pr(20, "wb/16-follow-up", "OPEN", { body: "Text.\n\nWorkbench: #19" });
    const { mismatches } = findDrift([card("16", "done"), card("19", "in_progress")], [named], []);
    expect(mismatches.map((m) => [m.card_id, m.expected])).toEqual([["19", "review"]]);
  });

  it("expects in progress for a branch without a pull request, or a draft", () => {
    const { mismatches } = findDrift(
      [card("5", "ready"), card("6", "review"), card("7", "needs_input")],
      [pr(30, "wb/6-draft", "OPEN", { isDraft: true })],
      ["wb/5-started", "wb/6-draft", "wb/7-waiting"],
    );
    expect(mismatches.map((m) => [m.card_id, m.expected, m.evidence.kind, m.hint])).toEqual([
      ["5", "in_progress", "branch", "pick"],
      ["6", "in_progress", "pull_request", "move review → in_progress"],
    ]);
  });

  it("does not count a merged pull request's leftover branch as a branch without one", () => {
    const { mismatches } = findDrift([card("16", "done")], prs, [...branches, "wb/16-record-a-batch-of-cards-handed-to-the-ai"]);
    expect(mismatches).toEqual([]);
  });

  it("prefers an open pull request over a merged one on the same card", () => {
    const { mismatches } = findDrift([card("16", "done")], [...prs, pr(40, "wb/16-follow-up", "OPEN")], branches);
    expect(mismatches.map((m) => [m.expected, m.evidence])).toEqual([
      ["review", { kind: "pull_request", number: 40, state: "open", branch: "wb/16-follow-up" }],
    ]);
  });

  describe("a card in progress with its pull request open", () => {
    const open = [pr(11, "wb/16-x", "OPEN")];
    const cards = [card("16", "in_progress")];

    it("is fetched for its log, and nothing else is", () => {
      expect(logsNeeded([...cards, card("17", "ready"), card("18", "review")], [...open, ...prs.slice(1)], [])).toEqual(["16"]);
    });

    it("is drift when nothing sent it back", () => {
      const log = new Map([["16", [{ type: "review_requested", pull_request: 11 }]]]);
      expect(findDrift(cards, open, [], log).mismatches.map((m) => m.hint)).toEqual(["move in_progress → review"]);
    });

    it("is fine when changes were requested after its latest review request", () => {
      const log = new Map([
        ["16", [{ type: "review_requested", pull_request: 11 }, { type: "changes_requested", pull_request: 11 }]],
      ]);
      expect(findDrift(cards, open, [], log).mismatches).toEqual([]);
    });

    it("is fine when a check failed after its latest review request", () => {
      const log = new Map([
        ["16", [{ type: "review_requested", pull_request: 11 }, { type: "check_ran", pull_request: 11, passed: false }]],
      ]);
      expect(findDrift(cards, open, [], log).mismatches).toEqual([]);
    });

    it("is drift again once review was asked for after the send-back, or when the send-back was on another pull request", () => {
      const again = new Map([
        [
          "16",
          [
            { type: "changes_requested", pull_request: 11 },
            { type: "review_requested", pull_request: 11 },
            { type: "check_ran", pull_request: 11, passed: true },
          ],
        ],
      ]);
      expect(findDrift(cards, open, [], again).mismatches).toHaveLength(1);
      const other = new Map([["16", [{ type: "review_requested", pull_request: 11 }, { type: "changes_requested", pull_request: 9 }]]]);
      expect(findDrift(cards, open, [], other).mismatches).toHaveLength(1);
    });
  });
});

describe("formatDrift", () => {
  it("prints one line per mismatch and a summary", () => {
    const text = formatDrift(findDrift([card("16", "in_progress"), card("17", "ready"), card("18", "review")], prs, branches));
    expect(text.split("\n")).toEqual([
      "#16   in_progress → done  pull request #11 merged (wb/16-record-a-batch-of-cards-handed-to-the-ai)  hint: move in_progress → review → done; check the approval first",
      "#17   ready → review  pull request #14 open (wb/17-let-a-person-select-several-ready-cards)  hint: pick, then move to review",
      "lanes: 2 cards of 3 that GitHub names sit in another lane on the board.",
    ]);
  });
});
