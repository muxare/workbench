// The team screen's data, `GET /api/team`: every person against every step.
// Teammates and functions are invented in the test and do not depend on the
// seed or on which files process/functions holds.
import { beforeEach, describe, expect, it } from "vitest";
import { teamResponse, type FunctionFrontMatter, type HumanTeammate, type Mode, type Teammate } from "@workbench/shared";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionDefinitions } from "./process.ts";
import { buildProfile } from "./profile.ts";
import { profileEvents, seed, type TeammateRecord } from "./store.ts";
import { buildTeam } from "./team.ts";

const base = [...loadFunctionDefinitions().values()][0];
if (!base) throw new Error("process/functions holds no function file");

/** An invented function definition, built from a real one so every other field is valid. */
function fn(name: string, role: FunctionFrontMatter["role"], allowed: Mode[], def: Mode): FunctionFrontMatter {
  const protocols: FunctionFrontMatter["protocols"] = {};
  for (const m of allowed) {
    protocols[m] = { opens: "human", asks: m === "manual" ? "none" : "ai", writes: m === "delegate" ? "ai" : "human", decides: "human" };
  }
  return { ...structuredClone(base!), name, role, title: `Invented ${name}`, summary: `Invented summary of ${name}.`, modes: { default: def, allowed }, protocols };
}

const definitions = new Map<string, FunctionFrontMatter>(
  [
    fn("shape_widget", "fe", ["manual", "assist", "delegate"], "assist"),
    fn("polish_widget", "fe", ["manual", "delegate"], "manual"),
    fn("design_widget", "ux", ["manual", "assist"], "assist"),
    fn("store_widget", "be", ["manual", "assist"], "manual"),
  ].map((d) => [d.name, d]),
);

const FE = "invented-fe-person";
const UX = "invented-ux-person";
const AI = "invented-ai-teammate";

const fe: HumanTeammate = { kind: "human", id: FE, name: "Invented frontend developer", roles: ["fe"], process_profile: { polish_widget: "delegate" } };
const ux: HumanTeammate = { kind: "human", id: UX, name: "Invented designer", roles: ["ux"], process_profile: { shape_widget: "manual" } };
const team: Teammate[] = [fe, { kind: "ai", id: AI, name: "Invented AI teammate" }, ux];

describe("buildTeam", () => {
  const built = buildTeam(team, definitions);

  it("lists every function file as a step, in file order, with what the file says", () => {
    expect(built.steps).toEqual(
      [...definitions.values()].map((d) => ({ function_id: d.name, role: d.role, title: d.title, summary: d.summary })),
    );
  });

  it("lists every person, in team order, and leaves out the AI teammate, which has no modes", () => {
    expect(built.people.map((p) => p.teammate.id)).toEqual([FE, UX]);
  });

  it("gives each person a cell for every step of their chain, and none for the others", () => {
    expect(built.people.map((p) => p.cells.map((c) => c.function_id))).toEqual([
      ["shape_widget", "polish_widget"],
      ["design_widget", "shape_widget"],
    ]);
  });

  it("takes each cell's mode, default and AI pick from the person's profile", () => {
    for (const person of [fe, ux]) {
      const profile = buildProfile(person, definitions, {});
      const cells = built.people.find((p) => p.teammate.id === person.id)?.cells;
      expect(cells).toEqual(
        profile.steps.map((s) => ({ function_id: s.function_id, mode: s.mode, mode_is_default: s.mode_is_default, ai_may_pick: s.ai_may_pick })),
      );
    }
    expect(built.people[0]?.cells).toEqual([
      { function_id: "shape_widget", mode: "assist", mode_is_default: true, ai_may_pick: true },
      { function_id: "polish_widget", mode: "delegate", mode_is_default: false, ai_may_pick: false },
    ]);
  });

  it("answers with steps and no people for a team with no person", () => {
    expect(buildTeam([], definitions)).toEqual({ steps: built.steps, people: [] });
  });

  it("parses as the shared response schema", () => {
    expect(() => teamResponse.parse(built)).not.toThrow();
  });
});

describe("GET /api/team", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  const records: TeammateRecord[] = [
    { kind: "human", id: FE, name: fe.name, roles: ["fe"] },
    { kind: "ai", id: AI, name: "Invented AI teammate" },
    { kind: "human", id: UX, name: ux.name, roles: ["ux"] },
  ];

  beforeEach(async () => {
    db = await openDb(":memory:");
    const events = [
      ...profileEvents(FE, fe.process_profile, "2026-11-01T09:00:00Z"),
      ...profileEvents(UX, ux.process_profile, "2026-11-01T09:00:00Z"),
    ];
    await seed(db, { teammates: records, joined_at: "2026-11-01T09:00:00Z", cycles: [], cards: [], events }, new Set(definitions.keys()));
    let n = 0;
    app = createApp({
      db,
      functionIds: new Set(definitions.keys()),
      definitions,
      now: () => new Date("2026-11-17T10:00:00Z"),
      newId: () => `invented-new-${++n}`,
    });
  });

  it("answers every person against every step, with modes derived from their mode_changed events", async () => {
    const res = await app.request("/api/team");
    expect(res.status).toBe(200);
    const body = teamResponse.parse(await res.json());
    expect(body.people.map((p) => p.teammate.id).sort()).toEqual([FE, UX].sort());
    expect(body.steps.map((s) => s.function_id)).toEqual([...definitions.keys()]);
    const byId = Object.fromEntries(body.people.map((p) => [p.teammate.id, p]));
    expect(byId[FE]?.teammate.process_profile).toEqual(fe.process_profile);
    expect(body).toEqual(buildTeam(body.people.map((p) => p.teammate), definitions));
  });

  it("follows a mode change made on a person's profile", async () => {
    await app.request(`/api/teammates/${FE}/modes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: FE, function_id: "shape_widget", mode: "delegate" }),
    });
    const body = teamResponse.parse(await (await app.request("/api/team")).json());
    const cell = body.people.find((p) => p.teammate.id === FE)?.cells.find((c) => c.function_id === "shape_widget");
    expect(cell).toEqual({ function_id: "shape_widget", mode: "delegate", mode_is_default: false, ai_may_pick: false });
  });

  it("answers no people when the team has no person", async () => {
    const empty = await openDb(":memory:");
    await seed(empty, { teammates: [records[1]!], joined_at: "2026-11-01T09:00:00Z", cycles: [], cards: [], events: [] }, new Set(definitions.keys()));
    const bare = createApp({ db: empty, functionIds: new Set(definitions.keys()), definitions });
    const body = teamResponse.parse(await (await bare.request("/api/team")).json());
    expect(body.people).toEqual([]);
    expect(body.steps).toHaveLength(definitions.size);
  });
});
