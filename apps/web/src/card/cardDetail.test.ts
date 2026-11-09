import { describe, expect, it } from "vitest";
import { isCardEvent, type CardEvent, type CardResponse, type FunctionFrontMatter } from "@workbench/shared";
import { AI, BE, card, PO, testBoard, UX } from "../board/testBoard.ts";
import {
  actorText,
  answerDraft,
  answererOf,
  cardLogLines,
  checkLines,
  detailMode,
  linkedWork,
  logTime,
  modeForOwner,
  openQuestions,
  protocolView,
  questionTally,
  readsOf,
  statusText,
  statusTone,
} from "./cardDetail.ts";
import { refreshKey } from "./useCardDetail.ts";

// Invented data: no real client, project or function file.
const fn: FunctionFrontMatter = {
  template: 1,
  name: "define_api_contract",
  role: "be",
  title: "Invented: define the contract",
  summary: "Invented summary.",
  inputs: [
    { artifact: "refined_ui_spec", required: true, from: "refine_ui_spec" },
    { artifact: "domain_rules", required: true, from: "external" },
    { artifact: "old_contract", required: false, from: "frame_problem" },
  ],
  context: [{ artifact: "codebase", from: "external" }],
  outputs: [{ artifact: "api_contract" }],
  checks: {
    structural: [
      { id: "s1", rule: "Invented rule one." },
      { id: "s2", rule: "Invented rule two." },
    ],
    consistency: [{ id: "c1", rule: "Invented consistency rule." }],
    human: { approver: "FE and BE", where: "Invented review", criteria: "Invented criteria." },
  },
  modes: { default: "delegate", allowed: ["manual", "assist", "delegate"] },
  protocols: {
    manual: { opens: "human", asks: "none", writes: "human", decides: "human" },
    assist: { opens: "human", asks: "ai", writes: "human", decides: "human", note: "Invented note." },
    delegate: { opens: "human", asks: "both", writes: "ai", decides: "human" },
  },
  decision_log: ["Invented decision."],
};

const at = (minute: number) => `2026-11-06T09:${String(minute).padStart(2, "0")}:00Z`;

function detail(over: Partial<CardResponse> = {}): CardResponse {
  const board = testBoard();
  return {
    card: board.cards.find((c) => c.id === "c-151")!,
    log: board.log.filter(isCardEvent).filter((e) => e.card_id === "c-151"),
    questions: board.open_questions.filter((q) => q.card_id === "c-151"),
    function: fn,
    ...over,
  };
}

describe("status", () => {
  it("names who a waiting card waits on, and the column otherwise", () => {
    const board = testBoard();
    expect(statusText(board.cards.find((c) => c.id === "c-151")!, board)).toBe("Needs input · waiting on BE");
    expect(statusText(board.cards.find((c) => c.id === "c-152")!, board)).toBe("Ready");
  });

  it("colours Needs input and Done, and nothing else", () => {
    expect(statusTone("needs_input")).toBe("needs-input");
    expect(statusTone("done")).toBe("assist");
    expect(statusTone("review")).toBe("neutral");
  });
});

describe("detailMode", () => {
  it("takes the mode of the latest pick", () => {
    expect(detailMode(detail(), testBoard())).toBe("assist");
  });

  it("falls back to the owner's process profile, then the function's default", () => {
    const board = testBoard();
    expect(detailMode(detail({ log: [] }), board)).toBe("assist");
    const unset = { ...detail({ log: [] }), card: card("c-9", { function_id: "define_api_contract", owner: UX }) };
    expect(detailMode(unset, board)).toBe("delegate");
    expect(detailMode({ ...unset, function: null }, board)).toBeUndefined();
  });
});

describe("protocol", () => {
  it("says the mode of the owner and each role of the protocol from the function file", () => {
    expect(modeForOwner("assist", "BE")).toBe("AI assists, BE drives");
    expect(modeForOwner("delegate", "BE")).toBe("AI does it, BE verifies");
    const view = protocolView(fn, "delegate", "Backend developer")!;
    expect(view.meaning).toBe("AI does it, I verify");
    expect(view.cells).toEqual([
      { label: "Opens", value: "Backend developer" },
      { label: "Asks", value: "Backend developer and AI" },
      { label: "Writes", value: "AI" },
      { label: "Decides", value: "Backend developer" },
    ]);
    expect(protocolView(fn, "assist", "BE")?.note).toBe("Invented note.");
    expect(actorText("none", "BE")).toBe("Nobody");
  });

  it("has no protocol for a mode the function does not allow", () => {
    expect(protocolView({ ...fn, protocols: { assist: fn.protocols.assist! } }, "manual", "BE")).toBeUndefined();
  });
});

describe("readsOf", () => {
  it("names the card an input comes from, or its function, and marks external input and context as standing", () => {
    const board = testBoard({
      cards: [
        card("c-147", { function_id: "refine_ui_spec" }),
        card("c-151", { function_id: "define_api_contract", links: [{ relation: "depends_on", card_id: "c-147" }] }),
      ],
    });
    expect(readsOf(fn, board.cards[1]!, board)).toEqual([
      { artifact: "refined_ui_spec", source: "from #147" },
      { artifact: "domain_rules", source: "standing" },
      { artifact: "old_contract", source: "from frame_problem · optional" },
      { artifact: "codebase", source: "standing" },
    ]);
  });
});

describe("questionTally", () => {
  it("counts questions and answers", () => {
    const open = detail().questions[0]!;
    expect(questionTally([open, { ...open, id: "q2", answer: "Invented.", decided_by: BE }])).toBe("2 questions, 1 answered");
    expect(questionTally([open])).toBe("1 question, 0 answered");
  });
});

describe("checkLines", () => {
  const ran = (id: string, check: "structural" | "consistency" | "human", passed: boolean, minute: number): CardEvent => ({
    id,
    type: "check_ran",
    card_id: "c-151",
    actor: AI,
    at: at(minute),
    check,
    passed,
    summary: `Invented ${id}`,
  });

  it("shows the latest result of each check and who runs it, from the function's checks", () => {
    const lines = checkLines([ran("a", "structural", false, 1), ran("b", "structural", true, 2), ran("c", "consistency", false, 3)], fn);
    expect(lines).toEqual([
      { kind: "structural", name: "Structural", by: "2 code rules", result: "Pass · Invented b", tone: "assist" },
      { kind: "consistency", name: "Consistency", by: "AI critic", result: "Invented c", tone: "needs-input" },
      { kind: "human", name: "Human", by: "FE and BE sign off", result: "Not started", tone: "muted" },
    ]);
  });
});

describe("logTime", () => {
  const now = new Date("2026-11-06T15:00:00Z");
  it("shows the time today, the weekday this week and the date before that", () => {
    expect(logTime("2026-11-06T09:41:00Z", now, "UTC")).toBe("09:41");
    expect(logTime("2026-11-04T09:41:00Z", now, "UTC")).toBe("Wed");
    expect(logTime("2026-10-20T09:41:00Z", now, "UTC")).toBe("20 Oct");
  });
});

describe("cardLogLines", () => {
  it("lists the card's events newest first", () => {
    const lines = cardLogLines(detail().log, testBoard(), new Date(at(50)), "UTC");
    expect(lines.map((l) => l.id)).toEqual(["e8", "e7", "e6"]);
    expect(lines[0]).toMatchObject({ time: "09:41", text: "AI moved #151 to Needs input · waiting on BE" });
  });
});

describe("linkedWork", () => {
  it("lists what the card depends on, then what it unblocks, with their status", () => {
    const board = testBoard();
    const c151 = board.cards.find((c) => c.id === "c-151")!;
    expect(linkedWork({ ...c151, links: [{ relation: "depends_on", card_id: "c-142" }] }, board)).toEqual([
      { relation: "Depends on", id: "c-142", ref: "#142", title: "Invented card c-142", status: "In progress", tone: "neutral" },
      { relation: "Unblocks", id: "c-152", ref: "#152", title: "Invented card c-152", status: "Ready", tone: "neutral" },
    ]);
  });

  it("says when a linked card is not on the board", () => {
    const board = testBoard();
    const lonely = card("c-9", { links: [{ relation: "depends_on", card_id: "c-gone" }] });
    expect(linkedWork(lonely, board)[0]).toMatchObject({ ref: "c-gone", status: "Not on the board" });
  });
});

describe("open questions", () => {
  it("answers as the person asked, else the card's human owner, never an AI", () => {
    const board = testBoard();
    const q = detail().questions[0]!;
    const c151 = detail().card;
    expect(answererOf(q, c151, board)).toBe(BE);
    expect(answererOf({ ...q, asked_of: AI }, c151, board)).toBe(BE);
    expect(answererOf({ ...q, asked_of: AI }, { ...c151, owner: AI }, board)).toBeUndefined();
    expect(answererOf({ ...q, asked_of: PO }, c151, board)).toBe(PO);
  });

  it("lists unanswered questions, the one the card waits on first, with who asked whom and when", () => {
    const d = detail();
    const open = d.questions[0]!;
    const other = { ...open, id: "q-other", text: "Invented other." };
    const answered = { ...open, id: "q-done", answer: "Invented.", decided_by: BE };
    const views = openQuestions({ ...d, questions: [other, answered, open] }, testBoard());
    expect(views.map((v) => v.question.id)).toEqual(["q-151", "q-other"]);
    expect(views[0]).toMatchObject({ route: "AI → Backend developer", at: at(41), answerer: BE, answererLabel: "Backend developer", resumes: true });
    expect(views[1]).toMatchObject({ resumes: false, at: undefined });
  });

  it("refuses an empty answer and trims the rest", () => {
    expect(answerDraft("   ")).toEqual({ ok: false, reason: "Write the answer first." });
    expect(answerDraft("  Cursor. \n")).toEqual({ ok: true, answer: "Cursor." });
  });
});

describe("refreshKey", () => {
  it("changes when the card gets an event or a new status, and not for other cards", () => {
    const board = testBoard();
    const key = refreshKey("c-151", board);
    const otherEvent: CardEvent = { id: "e9", type: "report_posted", card_id: "c-142", actor: UX, at: at(45), text: "Invented." };
    expect(refreshKey("c-151", { ...board, log: [...board.log, otherEvent] })).toBe(key);
    const ownEvent: CardEvent = { ...otherEvent, id: "e10", card_id: "c-151" };
    expect(refreshKey("c-151", { ...board, log: [...board.log, ownEvent] })).not.toBe(key);
    const moved = board.cards.map((c) => (c.id === "c-151" ? { ...c, status: { state: "in_progress" as const } } : c));
    expect(refreshKey("c-151", { ...board, cards: moved })).not.toBe(key);
  });
});
