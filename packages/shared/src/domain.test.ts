// All example data here is invented.
import { describe, expect, it } from "vitest";
import {
  card,
  cardEvent,
  cardEventType,
  currentCycle,
  criticRequired,
  cycle,
  cycleSetting,
  decidedByHuman,
  inCycle,
  defaultLogFilters,
  deriveCriticGates,
  deriveLogFilters,
  deriveProfile,
  deriveRoles,
  eventSubject,
  isCardEvent,
  logEventTypes,
  logFilters,
  nextCycle,
  normalizeEventTypes,
  question,
  sameEventTypes,
  sameRoles,
  shownInLog,
  status,
  streamEvent,
  streamEventType,
  teamEvent,
  teammate,
  teammateEvent,
  teammateRole,
  unfinishedDependencies,
  type Card,
  type CriticGateChangedEvent,
  type LogFilterChangedEvent,
  type RolesChangedEvent,
  type StreamEvent,
  type Teammate,
} from "./domain.ts";
import { functionRole } from "./functionFile.ts";

const at = "2026-11-08T09:41:00Z";

const pat: Teammate = {
  kind: "human",
  id: "invented-be",
  name: "Pat Example (invented)",
  roles: ["be"],
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
    expect(teammate.safeParse({ kind: "human", id: "invented-ux", name: "Invented", roles: ["ux"] }).success).toBe(false);
  });

  it("requires a human's roles to be po, ux, fe or be", () => {
    const base = { kind: "human", id: "invented-ux", name: "Invented", process_profile: {} };
    expect(teammateRole.options).toEqual(["po", "ux", "fe", "be"]);
    for (const role of teammateRole.options) expect(teammate.safeParse({ ...base, roles: [role] }).success).toBe(true);
    expect(teammate.safeParse(base).success).toBe(false);
    expect(teammate.safeParse({ ...base, roles: ["team"] }).success).toBe(false);
    expect(teammate.safeParse({ ...base, roles: ["PO"] }).success).toBe(false);
    expect(teammate.safeParse({ ...base, role: "ux" }).success).toBe(false);
  });

  it("lets a person hold several roles, in their own order, but at least one and each once", () => {
    const base = { kind: "human", id: "invented-all", name: "Invented", process_profile: {} };
    const every = { ...base, roles: ["fe", "po", "ux", "be"] };
    expect(teammate.parse(every)).toEqual(every);
    expect(teammate.safeParse({ ...base, roles: [] }).success).toBe(false);
    expect(teammate.safeParse({ ...base, roles: ["fe", "be", "fe"] }).success).toBe(false);
  });

  it("derives the person roles from the function roles, less team", () => {
    expect(teammateRole.options.filter((r) => r !== "po")).toEqual(functionRole.options.filter((r) => r !== "team"));
  });

  it("rejects an unknown mode and a function id that is not snake_case", () => {
    const base = { kind: "human", id: "invented-ux", name: "Invented", roles: ["ux"] };
    expect(teammate.safeParse({ ...base, process_profile: {} }).success).toBe(true);
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

describe("teammate events", () => {
  const change = {
    id: "invented-m1",
    type: "mode_changed",
    teammate_id: "invented-be",
    actor: "invented-be",
    at,
    function_id: "define_api_contract",
    from: null,
    to: "assist",
  } as const;

  it("accept a mode change with no card, from the default or from a mode", () => {
    expect(teammateEvent.parse(change)).toEqual(change);
    expect(streamEvent.parse({ ...change, from: "delegate" })).toEqual({ ...change, from: "delegate" });
  });

  it("refuse a mode change without its subject, function or target mode", () => {
    expect(streamEvent.safeParse({ ...change, teammate_id: undefined }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, function_id: "Define API" }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, to: null }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, to: "auto" }).success).toBe(false);
  });

  it("are not card events, and card events are stream events", () => {
    expect(cardEvent.safeParse(change).success).toBe(false);
    const report = { id: "invented-e1", type: "report_posted", card_id: "invented-151", actor: "invented-ai", at, text: "Invented." };
    expect(streamEvent.parse(report)).toEqual(report);
  });

  it("name their subject: a card, a teammate, or the team", () => {
    const report = streamEvent.parse({ id: "invented-e1", type: "report_posted", card_id: "invented-151", actor: "invented-ai", at, text: "Invented." });
    expect(eventSubject(report)).toEqual({ kind: "card", id: "invented-151" });
    expect(eventSubject(change)).toEqual({ kind: "teammate", id: "invented-be" });
    expect(isCardEvent(report)).toBe(true);
    expect(isCardEvent(change)).toBe(false);
    const filter = streamEvent.parse({ id: "invented-f1", type: "log_filter_changed", actor: "invented-be", at, log: "board", hidden: [], was_hidden: ["mode_changed"] });
    expect(eventSubject(filter)).toEqual({ kind: "team" });
    expect(isCardEvent(filter)).toBe(false);
  });

  it("give a person's profile: the latest change per function, only their own", () => {
    const events: StreamEvent[] = [
      change,
      { ...change, id: "invented-m2", from: "assist", to: "manual" },
      { ...change, id: "invented-m3", function_id: "write_issues", to: "delegate" },
      { ...change, id: "invented-m4", teammate_id: "invented-ux", actor: "invented-ux", to: "delegate" },
    ];
    expect(deriveProfile(events, "invented-be")).toEqual({ define_api_contract: "manual", write_issues: "delegate" });
    expect(deriveProfile(events, "invented-po")).toEqual({});
  });

  const joined: RolesChangedEvent = {
    id: "invented-r1",
    type: "roles_changed",
    teammate_id: "invented-all",
    actor: "invented-all",
    at,
    from: [],
    to: ["po", "ux"],
  };

  it("accept a roles change from no roles or from roles, to at least one role", () => {
    expect(teammateEvent.parse(joined)).toEqual(joined);
    expect(streamEvent.parse({ ...joined, from: ["po"] })).toEqual({ ...joined, from: ["po"] });
    expect(streamEvent.safeParse({ ...joined, to: [] }).success).toBe(false);
    expect(streamEvent.safeParse({ ...joined, to: ["po", "po"] }).success).toBe(false);
    expect(streamEvent.safeParse({ ...joined, from: ["po", "po"] }).success).toBe(false);
    expect(eventSubject(teammateEvent.parse(joined))).toEqual({ kind: "teammate", id: "invented-all" });
  });

  it("give a person's roles: the latest change wins, and none before they join", () => {
    const events: StreamEvent[] = [
      joined,
      change,
      { ...joined, id: "invented-r2", from: ["po", "ux"], to: ["fe", "po", "ux", "be"] },
      { ...joined, id: "invented-r3", teammate_id: "invented-ux", actor: "invented-ux", to: ["ux"] },
    ];
    expect(deriveRoles(events, "invented-all")).toEqual(["fe", "po", "ux", "be"]);
    expect(deriveRoles(events, "invented-be")).toEqual([]);
    expect(deriveProfile(events, "invented-all")).toEqual({});
  });

  it("compare roles in order, since the first is the main role", () => {
    expect(sameRoles(["po", "fe"], ["po", "fe"])).toBe(true);
    expect(sameRoles(["po", "fe"], ["fe", "po"])).toBe(false);
    expect(sameRoles([], ["po"])).toBe(false);
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

describe("cycleSetting and nextCycle", () => {
  const s1 = { id: "invented-1", name: "Invented stage 1", starts_at: "2026-11-11T00:00:00Z", ends_at: "2026-11-25T00:00:00Z" };
  const early = { id: "invented-early", name: "Invented early", starts_at: "2026-10-01T00:00:00+02:00", ends_at: "2026-10-15T00:00:00+02:00" };

  it("rejects a pattern without {n}, a zero length and unknown fields", () => {
    expect(cycleSetting.safeParse({ length_days: 14, id: "invented" }).success).toBe(false);
    expect(cycleSetting.safeParse({ length_days: 14, id: "invented-{n}", name: "Invented" }).success).toBe(false);
    expect(cycleSetting.safeParse({ length_days: 0, id: "invented-{n}" }).success).toBe(false);
    expect(cycleSetting.safeParse({ length_days: 14, id: "invented-{n}", weeks: 2 }).success).toBe(false);
  });

  it("starts where the cycle that ends last ends, whatever the list order, and numbers it after the cycles there", () => {
    const setting = cycleSetting.parse({ length_days: 7, id: "invented-{n}", name: "Invented week {n}" });
    expect(nextCycle(setting, [s1, early])).toEqual({
      id: "invented-3",
      name: "Invented week 3",
      starts_at: "2026-11-25T00:00:00Z",
      ends_at: "2026-12-02T00:00:00Z",
    });
  });

  it("takes a given name over the pattern, and needs one when there is no pattern", () => {
    const setting = cycleSetting.parse({ length_days: 14, id: "invented-{n}" });
    expect(nextCycle(setting, [s1], "Invented stage 2").name).toBe("Invented stage 2");
    expect(() => nextCycle(setting, [s1])).toThrow(/name must be given/);
    expect(() => nextCycle(setting, [s1], "  ")).toThrow(/name must be given/);
  });

  it("needs a cycle on the board to follow", () => {
    expect(() => nextCycle({ length_days: 14, id: "invented-{n}", name: "Invented {n}" }, [])).toThrow(/no cycle to follow/);
  });
});

describe("currentCycle", () => {
  const s1 = { id: "invented-s1", name: "Invented sprint 1", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-16T08:00:00Z" };
  const s2 = { id: "invented-s2", name: "Invented sprint 2", starts_at: "2026-11-16T08:00:00Z", ends_at: "2026-11-30T08:00:00Z" };
  const s3 = { id: "invented-s3", name: "Invented sprint 3", starts_at: "2026-12-07T08:00:00Z", ends_at: "2026-12-21T08:00:00Z" };
  const all = [s3, s1, s2];

  it("is the cycle whose window holds now, its end excluded", () => {
    expect(currentCycle(all, new Date("2026-11-09T12:00:00Z"))).toEqual({ cycle: s1, ended: false });
    expect(currentCycle(all, new Date("2026-11-16T08:00:00Z"))).toEqual({ cycle: s2, ended: false });
  });

  it("between cycles, is the one that ended last, marked ended", () => {
    expect(currentCycle(all, new Date("2026-12-01T00:00:00Z"))).toEqual({ cycle: s2, ended: true });
    expect(currentCycle(all, new Date("2027-01-01T00:00:00Z"))).toEqual({ cycle: s3, ended: true });
  });

  it("is undefined before any cycle has started", () => {
    expect(currentCycle(all, new Date("2026-10-01T00:00:00Z"))).toBeUndefined();
    expect(currentCycle([], new Date("2026-11-09T12:00:00Z"))).toBeUndefined();
  });

  it("takes the later start when two windows overlap", () => {
    const overlap = { ...s2, id: "invented-o", starts_at: "2026-11-09T00:00:00Z" };
    expect(currentCycle([s1, overlap], new Date("2026-11-10T00:00:00Z"))?.cycle.id).toBe("invented-o");
  });

  it("compares times, not strings, across offsets", () => {
    expect(inCycle(s1, "2026-11-16T08:59:59+01:00")).toBe(true);
    expect(inCycle(s1, "2026-11-16T09:00:00+01:00")).toBe(false);
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

describe("critic gate events", () => {
  const change: CriticGateChangedEvent = {
    id: "invented-g1",
    type: "critic_gate_changed",
    actor: "invented-po",
    at,
    function_id: "implement_services",
    required: true,
    was_required: false,
  };

  it("are team events, with neither a card nor a teammate", () => {
    expect(streamEvent.parse(change)).toEqual(change);
    expect(eventSubject(change)).toEqual({ kind: "team" });
    expect(streamEvent.safeParse({ ...change, function_id: "Not Snake" }).success).toBe(false);
  });

  it("give each function's gate: the latest change wins, and a function nobody set has it off", () => {
    expect(deriveCriticGates([])).toEqual({});
    const gates = deriveCriticGates([
      change,
      { ...change, id: "invented-g2", function_id: "fix_bug" },
      { ...change, id: "invented-g3", required: false, was_required: true },
    ]);
    expect(gates).toEqual({ implement_services: false, fix_bug: true });
    expect(criticRequired(gates, "fix_bug")).toBe(true);
    expect(criticRequired(gates, "implement_services")).toBe(false);
    expect(criticRequired(gates, "write_issues")).toBe(false);
  });
});

describe("log filter events", () => {
  const change: LogFilterChangedEvent = {
    id: "invented-f1",
    type: "log_filter_changed",
    actor: "invented-po",
    at,
    log: "board",
    hidden: ["mode_changed"],
    was_hidden: [],
  };

  it("list every event type in the stream, read from the schemas", () => {
    const fromUnion = streamEvent.options.map((o) => o.shape.type.value);
    expect(streamEventType.options).toEqual(fromUnion);
    expect(cardEventType.options).toEqual(cardEvent.options.map((o) => o.shape.type.value));
  });

  it("are team events, with neither a card nor a teammate", () => {
    expect(teamEvent.parse(change)).toEqual(change);
    expect(streamEvent.parse(change)).toEqual(change);
    expect(streamEvent.parse({ ...change, card_id: "invented-151" })).not.toHaveProperty("card_id");
  });

  it("refuse an unknown log, an unknown event type and a type listed twice", () => {
    expect(streamEvent.safeParse({ ...change, log: "sprint" }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, hidden: ["comment_added"] }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, hidden: ["picked", "picked"] }).success).toBe(false);
    expect(streamEvent.safeParse({ ...change, was_hidden: undefined }).success).toBe(false);
  });

  it("give each log's filter: the latest change per log wins, and every log shows everything by default", () => {
    expect(deriveLogFilters([])).toEqual(defaultLogFilters());
    const events: StreamEvent[] = [
      change,
      { ...change, id: "invented-f2", log: "cycle", hidden: ["report_posted", "picked"] },
      { ...change, id: "invented-f3", hidden: ["check_ran"], was_hidden: ["mode_changed"] },
    ];
    expect(deriveLogFilters(events)).toEqual({ card: [], board: ["check_ran"], cycle: ["report_posted", "picked"], teammate: [] });
    expect(logFilters.parse(deriveLogFilters(events))).toEqual(deriveLogFilters(events));
  });

  it("compare and order hidden sets by the schema", () => {
    expect(normalizeEventTypes(["mode_changed", "picked", "mode_changed"])).toEqual(["picked", "mode_changed"]);
    expect(sameEventTypes(["report_posted", "picked"], ["picked", "report_posted"])).toBe(true);
    expect(sameEventTypes(["picked"], [])).toBe(false);
  });

  it("offer card event types to the card log and every type to the others", () => {
    expect(logEventTypes("card")).toEqual(cardEventType.options);
    expect(logEventTypes("card")).not.toContain("mode_changed");
    expect(logEventTypes("board")).toEqual(streamEventType.options);
  });

  it("filter only the log they name, keeping the order of the rest", () => {
    const report = { id: "invented-e1", type: "report_posted", card_id: "invented-151", actor: "invented-ai", at, text: "Invented." } as const;
    const mode = { id: "invented-m1", type: "mode_changed", teammate_id: "invented-be", actor: "invented-be", at, function_id: "define_api_contract", from: null, to: "assist" } as const;
    const events: StreamEvent[] = [report, mode, change];
    const filters = { ...defaultLogFilters(), board: ["mode_changed" as const] };
    expect(shownInLog(events, filters, "board").map((e) => e.id)).toEqual(["invented-e1", "invented-f1"]);
    expect(shownInLog(events, filters, "cycle")).toEqual(events);
  });
});
