// All example data in these tests is invented.
import { beforeEach, describe, expect, it } from "vitest";
import type { FunctionFrontMatter } from "@workbench/shared";
import { openDb, type Db } from "../db/client.ts";
import { loadFunctionDefinitions, loadFunctionIds } from "../process.ts";
import { inventedSeed } from "../seed/invented.ts";
import { appendEvent, cardLog, cardStatus, seed, type SeedData } from "../store.ts";
import type { TeammateProvider } from "./provider.ts";
import { eligibleCards, runTeammate, TeammateRefusal } from "./runner.ts";
import { stubProvider } from "./stubProvider.ts";

const functionIds = loadFunctionIds();
const definitions = loadFunctionDefinitions();
const AI = "invented-ai";
const BE = "invented-be";

let counter = 0;
const newId = () => `invented-run-${String(++counter)}`;
const now = () => new Date("2026-11-08T10:00:00Z");

/** A copy of the definitions with one function changed. */
function withFunction(name: string, change: (fm: FunctionFrontMatter) => FunctionFrontMatter) {
  const copy = new Map(definitions);
  const fm = copy.get(name);
  if (!fm) throw new Error(`no ${name}`);
  copy.set(name, change(structuredClone(fm)));
  return copy;
}

/** The invented seed with one teammate's profile replaced. */
function seedWithProfile(id: string, profile: Record<string, "manual" | "assist" | "delegate">): SeedData {
  return {
    ...inventedSeed,
    teammates: inventedSeed.teammates.map((t) => (t.id === id && t.kind === "human" ? { ...t, process_profile: profile } : t)),
  };
}

async function freshDb(data: SeedData = inventedSeed): Promise<Db> {
  const db = await openDb(":memory:");
  await seed(db, data, functionIds);
  return db;
}

describe("eligibility from process/", () => {
  it("lets the AI pick only Ready cards whose owner works the function in assist", async () => {
    const db = await freshDb();
    const result = await eligibleCards(db, definitions);
    expect(result.filter((e) => e.eligible).map((e) => e.card.id)).toEqual(["invented-152"]);
    const reasons = Object.fromEntries(result.filter((e) => !e.eligible).map((e) => [e.card.id, e.eligible ? "" : e.reason]));
    expect(reasons["invented-151"]).toMatch(/needs_input, not ready/);
    expect(reasons["invented-153"]).toMatch(/backlog, not ready/);
  });

  it("refuses a card whose function does not allow assist", async () => {
    const db = await freshDb();
    const noAssist = withFunction("define_api_contract", (fm) => {
      delete fm.protocols.assist;
      return { ...fm, modes: { default: "delegate", allowed: ["manual", "delegate"] } };
    });
    await expect(
      runTeammate(db, { teammateId: AI, provider: stubProvider, cardId: "invented-152", definitions: noAssist, newId, now }),
    ).rejects.toThrow(/mode 'assist' is not in define_api_contract's modes.allowed/);
    expect(await runTeammate(db, { teammateId: AI, provider: stubProvider, definitions: noAssist })).toBeNull();
    expect((await cardStatus(db, "invented-152")).state).toBe("ready");
  });

  it("refuses when the owner chose another mode", async () => {
    const db = await freshDb(seedWithProfile(BE, { define_api_contract: "delegate" }));
    await expect(runTeammate(db, { teammateId: AI, provider: stubProvider, cardId: "invented-152" })).rejects.toThrow(
      /works define_api_contract in 'delegate'/,
    );
  });

  it("uses the function's default mode when the owner has not chosen one", async () => {
    const db = await freshDb(seedWithProfile(BE, {}));
    const run = await runTeammate(db, { teammateId: AI, provider: stubProvider, newId, now });
    expect(run?.card.id).toBe("invented-152");
    expect(run?.events[0]).toMatchObject({ type: "picked", mode: definitions.get("define_api_contract")?.modes.default });
  });

  it("refuses when the protocol does not let the AI ask", async () => {
    const db = await freshDb();
    const silent = withFunction("define_api_contract", (fm) => {
      if (fm.protocols.assist) fm.protocols.assist.asks = "none";
      return fm;
    });
    await expect(
      runTeammate(db, { teammateId: AI, provider: stubProvider, cardId: "invented-152", definitions: silent }),
    ).rejects.toThrow(/asks is 'none'/);
  });

  it("refuses when opens is human but the AI moved the card to Ready", async () => {
    const db = await freshDb();
    await appendEvent(db, {
      id: "invented-x1",
      type: "status_changed",
      card_id: "invented-153",
      actor: AI,
      at: "2026-11-08T09:00:00Z",
      from: "backlog",
      to: { state: "ready" },
    });
    const result = await eligibleCards(db, definitions);
    const card153 = result.find((e) => e.card.id === "invented-153");
    expect(card153?.eligible).toBe(false);
    expect(card153 && !card153.eligible && card153.reason).toMatch(/opens is human/);
  });

  it("refuses a teammate that is not an AI", async () => {
    const db = await freshDb();
    await expect(runTeammate(db, { teammateId: BE, provider: stubProvider })).rejects.toThrow(TeammateRefusal);
  });
});

describe("a run with the stub provider", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("appends the pick, the report, the question and the move to Needs input", async () => {
    const before = (await cardLog(db, "invented-152")).length;
    const run = await runTeammate(db, { teammateId: AI, provider: stubProvider, newId, now });
    expect(run?.card.id).toBe("invented-152");

    const log = await cardLog(db, "invented-152");
    const added = log.slice(before);
    expect(added.map((e) => e.type)).toEqual(["picked", "status_changed", "report_posted", "asked", "status_changed"]);
    expect(added.every((e) => e.actor === AI)).toBe(true);
    expect(added[0]).toMatchObject({ type: "picked", mode: "assist" });
    expect(added[1]).toMatchObject({ from: "ready", to: { state: "in_progress" } });

    const asked = added[3];
    if (asked?.type !== "asked") throw new Error("expected asked");
    expect(asked.asked_of).toBe(BE);
    // What it asks comes from the function file's tacit knowledge.
    const tacit = definitions.get("define_api_contract")?.tacit ?? [];
    expect(tacit.some((t) => asked.text.includes(t))).toBe(true);
    expect(asked.text).toMatch(/^Invented/);

    expect(added[4]).toMatchObject({
      from: "in_progress",
      to: { state: "needs_input", waiting_on: BE, question_id: asked.question_id },
    });
    expect(await cardStatus(db, "invented-152")).toEqual({
      state: "needs_input",
      waiting_on: BE,
      question_id: asked.question_id,
    });
    // The AI never answers.
    expect(log.some((e) => e.type === "answered" && e.actor === AI)).toBe(false);
  });

  it("finds nothing more to pick once the card waits on a person", async () => {
    await runTeammate(db, { teammateId: AI, provider: stubProvider, newId, now });
    expect(await runTeammate(db, { teammateId: AI, provider: stubProvider, newId, now })).toBeNull();
    await expect(
      runTeammate(db, { teammateId: AI, provider: stubProvider, cardId: "invented-152", newId, now }),
    ).rejects.toThrow(/needs_input, not ready/);
  });

  it("appends nothing when the provider asks someone who cannot decide", async () => {
    const asksItself: TeammateProvider = {
      name: "invented-bad",
      async work(context) {
        const step = await stubProvider.work(context);
        return { ...step, question: { ...step.question, asked_of: context.self.id } };
      },
    };
    const before = (await cardLog(db, "invented-152")).length;
    await expect(runTeammate(db, { teammateId: AI, provider: asksItself, newId, now })).rejects.toThrow(/decides is human/);
    expect(await cardLog(db, "invented-152")).toHaveLength(before);
    expect((await cardStatus(db, "invented-152")).state).toBe("ready");
  });
});
