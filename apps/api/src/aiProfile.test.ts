// The AI teammate's profile: the pure parts with invented definitions and
// teammates, and the route over the invented seed. All data here is invented.
import { describe, expect, it } from "vitest";
import {
  aiTeammateProfileResponse,
  teammateProfileResponse,
  type Card,
  type CardEvent,
  type FunctionFrontMatter,
  type Mode,
  type Question,
  type Teammate,
} from "@workbench/shared";
import { aiSteps, cardsInHand, questionsAsked, recentEvents } from "./aiProfile.ts";
import { createApp } from "./app.ts";
import { buildProfile } from "./profile.ts";
import { openDb } from "./db/client.ts";
import { loadFunctionDefinitions, loadFunctionIds } from "./process.ts";
import { inventedSeedAt } from "./seed/invented.ts";

/** The invented seed as loaded on 2026-11-07, so Sprint 4 runs from 2026-11-05 to 2026-11-19. */
const inventedSeed = inventedSeedAt(new Date("2026-11-07T08:00:00Z"));
import { seed } from "./store.ts";

const real = loadFunctionDefinitions();
const base = [...real.values()][0];
if (!base) throw new Error("process/functions holds no function file");

/** An invented function, built from a real one so every other field is valid. */
function fn(name: string, role: FunctionFrontMatter["role"], allowed: Mode[], def: Mode, asks: "ai" | "none" = "ai"): FunctionFrontMatter {
  const protocols: FunctionFrontMatter["protocols"] = {};
  for (const m of allowed) protocols[m] = { opens: "human", asks: m === "assist" ? asks : "none", writes: "human", decides: "human" };
  return { ...structuredClone(base!), name, role, title: `Invented ${name}`, summary: `Invented summary of ${name}.`, modes: { default: def, allowed }, protocols };
}

const definitions = new Map<string, FunctionFrontMatter>(
  [
    fn("shape_widget", "fe", ["manual", "assist", "delegate"], "assist"),
    fn("polish_widget", "fe", ["manual", "delegate"], "manual"),
    fn("plan_sprint", "team", ["assist", "delegate"], "delegate"),
    fn("quiet_widget", "ux", ["manual", "assist"], "assist", "none"),
  ].map((d) => [d.name, d]),
);

const FE = "invented-fe-person";
const UX = "invented-ux-person";
const AI = "invented-ai-teammate";
const teammates: Teammate[] = [
  { kind: "human", id: FE, name: "Invented frontend developer", roles: ["fe"], process_profile: { shape_widget: "delegate", plan_sprint: "assist" } },
  { kind: "human", id: UX, name: "Invented designer", roles: ["ux"], process_profile: {} },
  { kind: "ai", id: AI, name: "Invented AI teammate" },
];

/** A card owned by UX on a team step UX's own profile does not list. */
const uxPlanCard: Card = { id: "invented-c9", title: "Invented plan", function_id: "plan_sprint", owner: UX, links: [], status: { state: "backlog" } };

describe("aiSteps", () => {
  const steps = aiSteps(definitions, teammates, [uxPlanCard]);

  it("lists every function in file order, with fields read from its definition", () => {
    expect(steps.map((s) => s.function_id)).toEqual(["shape_widget", "polish_widget", "plan_sprint", "quiet_widget"]);
    expect(steps[0]).toMatchObject({ role: "fe", title: "Invented shape_widget", summary: "Invented summary of shape_widget." });
  });

  it("lists as owners exactly the people whose own profile lists the step, when no card says otherwise", () => {
    const withoutCards = aiSteps(definitions, teammates, []);
    for (const person of teammates) {
      if (person.kind !== "human") continue;
      const fromProfile = buildProfile(person, definitions).steps.map((s) => s.function_id).sort();
      const fromAi = withoutCards.filter((s) => s.owners.some((o) => o.teammate_id === person.id)).map((s) => s.function_id).sort();
      expect(fromAi).toEqual(fromProfile);
    }
  });

  it("adds anyone who owns a card on the step after the people whose profile lists it", () => {
    const owners = Object.fromEntries(steps.map((s) => [s.function_id, s.owners.map((o) => o.teammate_id)]));
    expect(owners).toEqual({ shape_widget: [FE], polish_widget: [FE], plan_sprint: [FE, UX], quiet_widget: [UX] });
    const withoutCards = aiSteps(definitions, teammates, []);
    expect(withoutCards.find((s) => s.function_id === "plan_sprint")?.owners.map((o) => o.teammate_id)).toEqual([FE]);
  });

  it("uses each owner's mode, or the default, and says why the AI may not pick", () => {
    const rows = steps.flatMap((s) => s.owners.map((o) => [s.function_id, o.teammate_id, o.mode, o.ai_may_pick]));
    expect(rows).toEqual([
      ["shape_widget", FE, "delegate", false],
      ["polish_widget", FE, "manual", false],
      ["plan_sprint", FE, "assist", true],
      ["plan_sprint", UX, "delegate", false],
      ["quiet_widget", UX, "assist", false],
    ]);
    const owner = (fnId: string, id: string) => steps.find((s) => s.function_id === fnId)?.owners.find((o) => o.teammate_id === id);
    expect(owner("plan_sprint", FE)?.reason).toBeNull();
    expect(owner("shape_widget", FE)?.reason).toMatch(/works only in assist/);
    expect(owner("quiet_widget", UX)?.reason).toMatch(/asks is 'none'/);
  });
});

const card = (id: string, state: "ready" | "in_progress" | "needs_input" | "review" | "done"): Card =>
  state === "needs_input"
    ? { id, title: `Invented ${id}`, function_id: "shape_widget", owner: FE, links: [], status: { state, waiting_on: FE, question_id: "q" } }
    : { id, title: `Invented ${id}`, function_id: "shape_widget", owner: FE, links: [], status: { state } };
const picked = (cardId: string, actor: string, mode: Mode, n: number): CardEvent => ({
  id: `e${String(n)}`,
  card_id: cardId,
  actor,
  at: "2026-11-09T10:00:00Z",
  type: "picked",
  mode,
});

describe("cardsInHand", () => {
  it("lists active cards whose latest pick was the AI's, with that pick's mode", () => {
    const cards = [card("c1", "needs_input"), card("c2", "done"), card("c3", "in_progress"), card("c4", "review")];
    const log = [picked("c1", AI, "assist", 1), picked("c2", AI, "assist", 2), picked("c3", AI, "assist", 3), picked("c3", FE, "manual", 4), picked("c4", AI, "delegate", 5)];
    expect(cardsInHand(AI, cards, log).map((x) => [x.card.id, x.mode])).toEqual([
      ["c1", "assist"],
      ["c4", "delegate"],
    ]);
  });
});

describe("questionsAsked and recentEvents", () => {
  const q = (id: string, by: string, answered: boolean): Question => ({
    id,
    card_id: "c1",
    asked_by: by,
    asked_of: FE,
    text: "Invented?",
    why_it_blocks: "Invented.",
    ...(answered ? { answer: "Invented.", decided_by: FE } : {}),
  });

  it("lists the AI's questions, open first, then latest first", () => {
    const qs = [q("q1", AI, true), q("q2", AI, false), q("q3", FE, false), q("q4", AI, true), q("q5", AI, false)];
    expect(questionsAsked(AI, qs).map((x) => x.id)).toEqual(["q5", "q2", "q4", "q1"]);
  });

  it("keeps the AI's latest events, newest first", () => {
    const log = [1, 2, 3, 4, 5].map((n) => picked("c1", n === 3 ? FE : AI, "assist", n));
    expect(recentEvents(AI, log, 3).map((e) => e.id)).toEqual(["e5", "e4", "e2"]);
  });
});

describe("GET /api/teammates/:id/profile for an AI teammate", () => {
  async function app(deps: { teammateTimer?: { teammateId: string; intervalMs: number } } = {}) {
    const db = await openDb(":memory:");
    await seed(db, inventedSeed, loadFunctionIds());
    return createApp({ db, functionIds: loadFunctionIds(), definitions: real, ...deps });
  }

  it("answers the derived profile in the shared schema, and a person still gets theirs", async () => {
    const api = await app();
    const res = await api.request("/api/teammates/invented-ai/profile");
    expect(res.status).toBe(200);
    const body = aiTeammateProfileResponse.parse(await res.json());
    expect(body.teammate.id).toBe("invented-ai");
    expect(body.works_in).toEqual(["assist"]);
    expect(body.provider).toBe("stub");
    expect(body.timer).toBeNull();
    expect(body.steps.map((s) => s.function_id)).toEqual([...real.keys()]);
    expect(body.next.map((n) => [n.card.id, n.mode])).toEqual([["invented-108", "assist"]]);
    expect(body.not_next.every((n) => n.card.status.state === "ready" && !n.reason.startsWith(n.card.id))).toBe(true);

    const person = await api.request("/api/teammates/invented-fe/profile");
    expect(teammateProfileResponse.parse(await person.json()).teammate.id).toBe("invented-fe");
  });

  it("says the timer is on only for the teammate it runs", async () => {
    const on = await app({ teammateTimer: { teammateId: "invented-ai", intervalMs: 5000 } });
    expect(aiTeammateProfileResponse.parse(await (await on.request("/api/teammates/invented-ai/profile")).json()).timer).toEqual({ interval_ms: 5000 });
    const other = await app({ teammateTimer: { teammateId: "invented-other-ai", intervalMs: 5000 } });
    expect(aiTeammateProfileResponse.parse(await (await other.request("/api/teammates/invented-ai/profile")).json()).timer).toBeNull();
  });

  it("lists next in the order runs take the cards", async () => {
    const api = await app();
    const post = (path: string, payload: unknown) =>
      api.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    // A second card the AI may pick: the frontend developer's own step, moved to Ready by them.
    const fe = "invented-fe";
    const created = await post("/api/cards", { actor: fe, title: "Invented second spec", function_id: "refine_ui_spec", owner: fe });
    const { card } = (await created.json()) as { card: Card };
    expect((await post(`/api/cards/${card.id}/status`, { actor: fe, from: "backlog", to: { state: "ready" } })).status).toBe(200);

    const profile = async () => aiTeammateProfileResponse.parse(await (await api.request("/api/teammates/invented-ai/profile")).json());
    const before = await profile();
    expect(before.next).toHaveLength(2);
    for (const expected of before.next.map((n) => n.card.id)) {
      const current = await profile();
      expect(current.next[0]?.card.id).toBe(expected);
      const run = await api.request("/api/teammates/invented-ai/run", { method: "POST" });
      expect(((await run.json()) as { card: Card }).card.id).toBe(expected);
    }
  });

  it("shows a run: the card in hand, its open question first and its events newest first", async () => {
    const api = await app();
    expect((await api.request("/api/teammates/invented-ai/run", { method: "POST" })).status).toBe(200);
    const body = aiTeammateProfileResponse.parse(await (await api.request("/api/teammates/invented-ai/profile")).json());
    expect(body.now.map((n) => [n.card.id, n.card.status.state, n.mode])).toContainEqual(["invented-108", "needs_input", "assist"]);
    expect(body.next).toEqual([]);
    expect(body.questions[0]).toMatchObject({ card_id: "invented-108", asked_by: "invented-ai" });
    expect(body.questions[0]?.answer).toBeUndefined();
    expect(body.recent.slice(0, 3).map((e) => [e.card_id, e.type])).toEqual([
      ["invented-108", "status_changed"],
      ["invented-108", "asked"],
      ["invented-108", "report_posted"],
    ]);
  });
});
