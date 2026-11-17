// The AI teammate's pick rules, over the real refine_ui_spec function file.
// All teammates and cards here are invented.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBatches } from "./batch.ts";
import type { Card, CardEvent, CardStatus, HumanTeammate, Mode, Teammate } from "./domain.ts";
import { checkEligibility, TEAMMATE_MODES, workableMode } from "./eligibility.ts";
import { loadFunctionFile } from "./node.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const refine = loadFunctionFile(path.join(repoRoot, "process/functions/fe/refine_ui_spec.md")).frontMatter;
const definitions = new Map([[refine.name, refine]]);
const at = "2026-11-15T10:00:00Z";

const fe = (mode?: Mode): HumanTeammate => ({
  kind: "human",
  id: "invented-fe",
  name: "Invented frontend developer",
  roles: ["fe"],
  process_profile: mode ? { refine_ui_spec: mode } : {},
});
const ai: Teammate = { kind: "ai", id: "invented-ai", name: "Invented AI" };

const card = (id: string, state: CardStatus = "ready", dependsOn: string[] = []): Card => ({
  id,
  title: `Invented card ${id}`,
  function_id: "refine_ui_spec",
  owner: "invented-fe",
  status: { state } as Card["status"],
  links: dependsOn.map((card_id) => ({ relation: "depends_on" as const, card_id })),
});

/** The card was moved to Ready by `actor`, which matters when the protocol says a person opens. */
const openedBy = (cardId: string, actor: string): CardEvent[] => [
  { id: `s-${cardId}`, type: "status_changed", card_id: cardId, actor, at, from: "backlog", to: { state: "ready" } },
];

describe("workableMode", () => {
  it("accepts a mode the teammate works in, and refuses one it does not or that gives the AI no part", () => {
    expect(workableMode(refine, "assist").ok).toBe(true);
    expect(workableMode(refine, "delegate")).toMatchObject({ ok: false, reason: expect.stringMatching(/works only in assist/) });
    expect(workableMode(refine, "delegate", ["assist", "delegate"]).ok).toBe(true);
    expect(workableMode(refine, "manual", ["manual"])).toMatchObject({ ok: false, reason: expect.stringMatching(/may not ask/) });
  });
});

describe("checkEligibility", () => {
  const teammates = [fe(), ai];

  it("lets the AI pick a Ready card a person opened, in its owner's mode", () => {
    const c = card("1");
    const verdict = checkEligibility(c, openedBy("1", "invented-fe"), definitions, teammates, [c]);
    expect(verdict).toMatchObject({ eligible: true, mode: "assist" });
    expect(TEAMMATE_MODES).toEqual(["assist"]);
  });

  it("refuses a card that is not Ready, one the AI opened, and one in the owner's manual mode", () => {
    const busy = card("1", "in_progress");
    expect(checkEligibility(busy, [], definitions, teammates, [busy])).toMatchObject({ eligible: false, reason: "1: card is in_progress, not ready" });
    const c = card("2");
    expect(checkEligibility(c, openedBy("2", "invented-ai"), definitions, teammates, [c])).toMatchObject({
      eligible: false,
      reason: expect.stringMatching(/opens is human/),
    });
    expect(checkEligibility(c, openedBy("2", "invented-fe"), definitions, [fe("manual"), ai], [c], ["assist", "delegate"])).toMatchObject({
      eligible: false,
    });
  });

  it("meets a dependency picked in an earlier wave of a plan, but not one still Ready", () => {
    const later = card("2", "ready", ["1"]);
    const events = [
      { id: "h1", type: "batch_handed" as const, actor: "invented-fe", at, batch_id: "1", card_ids: ["1", "2"], handed_to: "invented-ai" },
      {
        id: "p1",
        type: "batch_planned" as const,
        actor: "invented-ai",
        at,
        batch_id: "1",
        waves: [
          { card_ids: ["1"], note: "Invented." },
          { card_ids: ["2"], note: "Invented." },
        ],
      },
    ];
    const picked = [card("1", "in_progress"), later];
    const stillReady = [card("1"), later];
    const log = openedBy("2", "invented-fe");
    expect(checkEligibility(later, log, definitions, teammates, picked, undefined, deriveBatches(events, picked)).eligible).toBe(true);
    expect(checkEligibility(later, log, definitions, teammates, stillReady, undefined, deriveBatches(events, stillReady))).toMatchObject({
      eligible: false,
      reason: "2: depends on 1, which is not done",
    });
    expect(checkEligibility(later, log, definitions, teammates, picked)).toMatchObject({ eligible: false });
  });
});
