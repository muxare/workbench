// The teammate profile: the chain built from function definitions, and the
// profile routes. Teammates and functions here are invented in the test and
// do not depend on the seed or on which files process/functions holds.
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiError,
  teammateProfileResponse,
  type FunctionFrontMatter,
  type HumanTeammate,
  type Mode,
  type Teammate,
} from "@workbench/shared";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";
import { loadFunctionDefinitions } from "./process.ts";
import { buildProfile } from "./profile.ts";
import { getTeammate, lastSeq, seed } from "./store.ts";

const base = [...loadFunctionDefinitions().values()][0];
if (!base) throw new Error("process/functions holds no function file");

/** An invented function definition, built from a real one so every other field is valid. */
function fn(
  name: string,
  role: FunctionFrontMatter["role"],
  allowed: Mode[],
  def: Mode,
  asks: FunctionFrontMatter["protocols"]["assist"] = { opens: "human", asks: "ai", writes: "human", decides: "human" },
): FunctionFrontMatter {
  const protocols: FunctionFrontMatter["protocols"] = {};
  for (const m of allowed) protocols[m] = m === "assist" ? asks : { opens: "human", asks: "none", writes: "human", decides: "human" };
  return { ...structuredClone(base!), name, role, title: `Invented ${name}`, summary: `Invented summary of ${name}.`, modes: { default: def, allowed }, protocols };
}

const definitions = new Map<string, FunctionFrontMatter>(
  [
    fn("shape_widget", "fe", ["manual", "assist", "delegate"], "assist"),
    fn("polish_widget", "fe", ["manual", "delegate"], "manual"),
    fn("plan_sprint", "team", ["assist", "delegate"], "delegate"),
    fn("design_widget", "ux", ["manual", "assist"], "assist"),
  ].map((d) => [d.name, d]),
);

const FE = "invented-fe-person";
const UX = "invented-ux-person";
const AI = "invented-ai-teammate";

const fePerson: HumanTeammate = {
  kind: "human",
  id: FE,
  name: "Invented frontend developer",
  role: "fe",
  process_profile: { polish_widget: "delegate", plan_sprint: "assist", gone_function: "manual" },
};
const teammates: Teammate[] = [
  fePerson,
  { kind: "human", id: UX, name: "Invented designer", role: "ux", process_profile: {} },
  { kind: "ai", id: AI, name: "Invented AI teammate" },
];

describe("buildProfile", () => {
  const profile = buildProfile(fePerson, definitions);

  it("lists the person's role's functions first, then the other functions in their profile", () => {
    expect(profile.steps.map((s) => s.function_id)).toEqual(["shape_widget", "polish_widget", "plan_sprint"]);
  });

  it("reads title, summary, role and modes from the function definition", () => {
    const polish = profile.steps.find((s) => s.function_id === "polish_widget");
    expect(polish).toMatchObject({
      role: "fe",
      title: "Invented polish_widget",
      summary: "Invented summary of polish_widget.",
      modes: { default: "manual", allowed: ["manual", "delegate"] },
    });
  });

  it("uses the person's mode, or the function's default when they have not chosen one", () => {
    const byId = Object.fromEntries(profile.steps.map((s) => [s.function_id, [s.mode, s.mode_is_default]]));
    expect(byId).toEqual({
      shape_widget: ["assist", true],
      polish_widget: ["delegate", false],
      plan_sprint: ["assist", false],
    });
  });

  it("says the AI may pick only where the mode is one it works in and the protocol lets it ask", () => {
    const pick = Object.fromEntries(profile.steps.map((s) => [s.function_id, s.ai_may_pick]));
    expect(pick).toEqual({ shape_widget: true, polish_widget: false, plan_sprint: true });

    const silent = new Map(definitions);
    silent.set("shape_widget", fn("shape_widget", "fe", ["manual", "assist"], "assist", { opens: "human", asks: "none", writes: "human", decides: "human" }));
    expect(buildProfile(fePerson, silent).steps.find((s) => s.function_id === "shape_widget")?.ai_may_pick).toBe(false);
  });

  it("lists profile entries with no function file as unknown", () => {
    expect(profile.unknown_functions).toEqual(["gone_function"]);
  });

  it("parses as the shared response schema", () => {
    expect(() => teammateProfileResponse.parse(profile)).not.toThrow();
  });
});

describe("profile routes", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    db = await openDb(":memory:");
    await seed(db, { teammates, cycles: [], cards: [], events: [] }, new Set(definitions.keys()));
    app = createApp({ db, functionIds: new Set(definitions.keys()), definitions });
  });

  const setMode = (id: string, payload: unknown) =>
    app.request(`/api/teammates/${id}/modes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  async function expectProblem(res: Response, status: number, error: string, reason?: RegExp) {
    expect(res.status).toBe(status);
    const body = apiError.parse(await res.json());
    expect(body.error).toBe(error);
    if (reason) expect(body.reason).toMatch(reason);
  }

  it("GET /api/teammates/:id/profile answers with the person's chain", async () => {
    const res = await app.request(`/api/teammates/${UX}/profile`);
    expect(res.status).toBe(200);
    const body = teammateProfileResponse.parse(await res.json());
    expect(body.teammate.id).toBe(UX);
    expect(body.steps.map((s) => [s.function_id, s.mode, s.mode_is_default])).toEqual([["design_widget", "assist", true]]);
  });

  it("GET answers 404 for an unknown teammate and 422 for an AI teammate", async () => {
    await expectProblem(await app.request("/api/teammates/invented-nobody/profile"), 404, "not_found");
    await expectProblem(await app.request(`/api/teammates/${AI}/profile`), 422, "rule_violation", /no process profile/);
  });

  it("POST /api/teammates/:id/modes stores the mode, answers with the new profile and appends no event", async () => {
    const res = await setMode(FE, { actor: FE, function_id: "shape_widget", mode: "delegate" });
    expect(res.status).toBe(200);
    const body = teammateProfileResponse.parse(await res.json());
    expect(body.steps.find((s) => s.function_id === "shape_widget")).toMatchObject({ mode: "delegate", mode_is_default: false, ai_may_pick: false });
    const stored = await getTeammate(db, FE);
    expect(stored?.kind === "human" && stored.process_profile.shape_widget).toBe("delegate");
    expect(await lastSeq(db)).toBe(0);
  });

  it("POST refuses a mode the function file does not allow", async () => {
    await expectProblem(await setMode(FE, { actor: FE, function_id: "polish_widget", mode: "assist" }), 422, "rule_violation", /allows manual, delegate/);
  });

  it("POST refuses a function that is not in process/", async () => {
    await expectProblem(await setMode(FE, { actor: FE, function_id: "no_such_step", mode: "manual" }), 422, "rule_violation", /no function/);
  });

  it("POST refuses anyone but the person themselves", async () => {
    await expectProblem(await setMode(FE, { actor: UX, function_id: "shape_widget", mode: "manual" }), 403, "forbidden");
    await expectProblem(await setMode(FE, { actor: AI, function_id: "shape_widget", mode: "manual" }), 403, "forbidden");
  });

  it("POST refuses a bad body and an AI teammate's profile", async () => {
    await expectProblem(await setMode(FE, { actor: FE, function_id: "shape_widget", mode: "sometimes" }), 400, "invalid_request");
    await expectProblem(await setMode(AI, { actor: AI, function_id: "shape_widget", mode: "assist" }), 422, "rule_violation");
  });
});
