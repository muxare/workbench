// All example data here is invented.
import { describe, expect, it } from "vitest";
import {
  card,
  cardEvent,
  cycle,
  decidedByHuman,
  question,
  status,
  teammate,
  teammateRole,
  unfinishedDependencies,
  type Card,
  type Teammate,
} from "./domain.ts";
import { functionRole } from "./functionFile.ts";

const at = "2026-11-08T09:41:00Z";

const pat: Teammate = {
  kind: "human",
  id: "invented-be",
  name: "Pat Example (invented)",
  role: "be",
  process_profile: { define_api_contract: "assist", write_issues: "delegate" },
};
const bot: Teammate = { kind: "ai", id: "invented-ai", name: "AI teammate (invented)" };

const openQuestion = {
  id: "invented-q1",
  card_id: "invented-151",
  asked_by: "invented-ai",
  asked_of: "invented-be",
  text: "Invented: should the example contract page by cursor or by page number?",
  why_it_blocks: "Invented: it changes the response shape.",
};

describe("teammate", () => {
  it("accepts a human with a process profile and an AI without one", () => {
    expect(teammate.parse(pat)).toEqual(pat);
    expect(teammate.parse(bot)).toEqual(bot);
  });

  it("requires a process profile for a human", () => {
    expect(teammate.safeParse({ kind: "human", id: "invented-ux", name: "Invented", role: "ux" }).success).toBe(false);
  });

  it("requires a human's role to be po, ux, fe or be", () => {
    const base = { kind: "human", id: "invented-ux", name: "Invented", process_profile: {} };
    expect(teammateRole.options).toEqual(["po", "ux", "fe", "be"]);
    for (const role of teammateRole.options) expect(teammate.safeParse({ ...base, role }).success).toBe(true);
    expect(teammate.safeParse(base).success).toBe(false);
    expect(teammate.safeParse({ ...base, role: "team" }).success).toBe(false);
    expect(teammate.safeParse({ ...base, role: "PO" }).success).toBe(false);
  });

  it("derives the person roles from the function roles, less team", () => {
    expect(teammateRole.options.filter((r) => r !== "po")).toEqual(functionRole.options.filter((r) => r !== "team"));
  });

  it("rejects an unknown mode and a function id that is not snake_case", () => {
    const base = { kind: "human", id: "invented-ux", name: "Invented", role: "ux" };
    expect(teammate.safeParse({ ...base, process_profile: { frame_problem: "auto" } }).success).toBe(false);
    expect(teammate.safeParse({ ...base, process_profile: { "Frame Problem": "assist" } }).success).toBe(false);
  });
});

describe("status", () => {
  it("accepts needs_input with waiting_on and the open question", () => {
    expect(status.safeParse({ state: "needs_input", waiting_on: "invented-be", question_id: "invented-q1" }).success).toBe(true);
  });

  it("rejects needs_input without waiting_on", () => {
    expect(status.safeParse({ state: "needs_input", question_id: "invented-q1" }).success).toBe(false);
  });

  it.each(["backlog", "ready", "in_progress", "review", "done"])("rejects waiting_on on %s", (state) => {
    expect(status.safeParse({ state }).success).toBe(true);
    expect(status.safeParse({ state, waiting_on: "invented-be" }).success).toBe(false);
  });
});

describe("card", () => {
  it("accepts a card with a milestone and a link", () => {
    const c = {
      id: "invented-151",
      title: "Invented: define the example orders contract",
      function_id: "define_api_contract",
      owner: "invented-be",
      status: { state: "needs_input", waiting_on: "invented-be", question_id: "invented-q1" },
      milestone: "Invented milestone",
      links: [{ relation: "depends_on", card_id: "invented-147" }],
    };
    expect(card.parse(c)).toEqual(c);
  });

  it("accepts a card without a milestone", () => {
    const c = { id: "invented-152", title: "Invented", function_id: "write_issues", owner: "invented-be", status: { state: "ready" }, links: [] };
    expect(card.safeParse(c).success).toBe(true);
  });
});

describe("question", () => {
  it("accepts an open question and an answered one", () => {
    expect(question.safeParse(openQuestion).success).toBe(true);
    expect(question.safeParse({ ...openQuestion, answer: "Invented: cursor.", decided_by: "invented-be" }).success).toBe(true);
  });

  it("rejects an answer without a decider", () => {
    expect(question.safeParse({ ...openQuestion, answer: "Invented: cursor." }).success).toBe(false);
  });

  it("checks that the decider is a human teammate", () => {
    const answered = question.parse({ ...openQuestion, answer: "Invented: cursor.", decided_by: "invented-be" });
    expect(decidedByHuman(answered, [pat, bot])).toBe(true);
    expect(decidedByHuman({ ...answered, decided_by: "invented-ai" }, [pat, bot])).toBe(false);
    expect(decidedByHuman({ ...answered, decided_by: "invented-nobody" }, [pat, bot])).toBe(false);
  });
});

describe("cardEvent", () => {
  const base = { id: "invented-e1", card_id: "invented-151", actor: "invented-ai", at };

  it.each([
    { type: "picked", mode: "assist" },
    { type: "asked", question_id: "invented-q1", asked_of: "invented-be", text: "Invented?", why_it_blocks: "Invented." },
    { type: "answered", question_id: "invented-q1", answer: "Invented: cursor." },
    { type: "check_ran", check: "structural", passed: false, summary: "Invented: 6 of 7 rules pass." },
    { type: "status_changed", from: "in_progress", to: { state: "needs_input", waiting_on: "invented-be", question_id: "invented-q1" } },
    { type: "report_posted", text: "Invented: draft 2 is ready." },
  ])("accepts a $type event", (payload) => {
    expect(cardEvent.parse({ ...base, ...payload })).toEqual({ ...base, ...payload });
  });

  it("rejects an unknown event type", () => {
    expect(cardEvent.safeParse({ ...base, type: "deleted" }).success).toBe(false);
  });

  it("rejects a timestamp that is not ISO 8601", () => {
    expect(cardEvent.safeParse({ ...base, at: "08/11/2026 09:41", type: "report_posted", text: "Invented." }).success).toBe(false);
  });

  it("rejects a status change to needs_input without waiting_on", () => {
    const e = { ...base, type: "status_changed", from: "in_progress", to: { state: "needs_input", question_id: "invented-q1" } };
    expect(cardEvent.safeParse(e).success).toBe(false);
  });
});

describe("cycle", () => {
  it("accepts a window that ends after it starts, across time zone offsets", () => {
    const c = { id: "invented-s14", name: "Invented sprint", starts_at: "2026-11-02T09:00:00+01:00", ends_at: "2026-11-02T08:30:00Z" };
    expect(cycle.parse(c)).toEqual(c);
  });

  it("rejects a window that ends before it starts", () => {
    const c = { id: "invented-s14", name: "Invented sprint", starts_at: "2026-11-16T08:00:00Z", ends_at: "2026-11-02T08:00:00Z" };
    expect(cycle.safeParse(c).success).toBe(false);
  });
});

describe("unfinishedDependencies", () => {
  const make = (id: string, state: "ready" | "done", links: string[] = []): Card => ({
    id,
    title: "Invented",
    function_id: "define_api_contract",
    owner: "invented-be",
    status: { state },
    links: links.map((card_id) => ({ relation: "depends_on" as const, card_id })),
  });

  it("lists dependencies that are not done, and unknown ones", () => {
    const cards = [make("invented-1", "done"), make("invented-2", "ready"), make("invented-3", "ready", ["invented-1", "invented-2", "invented-9"])];
    expect(unfinishedDependencies(cards[2]!, cards)).toEqual(["invented-2", "invented-9"]);
  });

  it("is empty when every dependency is done", () => {
    const cards = [make("invented-1", "done"), make("invented-3", "ready", ["invented-1"])];
    expect(unfinishedDependencies(cards[1]!, cards)).toEqual([]);
  });
});
