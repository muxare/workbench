// Runs one step of the AI teammate: choose a card it may pick, ask the
// provider for the work, then append the pick, the report, the question and
// the move to Needs input as one write through the store's `appendEvents`, so
// a run lands whole or not at all. The runner never
// answers a question and never moves a card past Needs input: in every
// protocol `decides` is human, so the next move belongs to the person asked.
import { randomUUID } from "node:crypto";
import type { Card, CardEvent, FunctionFrontMatter } from "@workbench/shared";
import type { Db } from "../db/client.ts";
import { loadFunctionDefinitions } from "../process.ts";
import { appendEvents, cardLog, listCards, listTeammates } from "../store.ts";
import { checkEligibility, type Eligibility } from "./eligibility.ts";
import type { TeammateProvider, WorkStep } from "./provider.ts";

/** Thrown when the teammate is asked to work a card it may not pick, or a provider breaks the rules. */
export class TeammateRefusal extends Error {
  override name = "TeammateRefusal";
}

export interface RunOptions {
  /** The AI teammate's id; it must be a teammate of kind `ai`. */
  teammateId: string;
  provider: TeammateProvider;
  /** Work this card, or refuse. Without it, the first eligible card by id. */
  cardId?: string;
  /** Function definitions keyed by name. Defaults to process/functions. */
  definitions?: ReadonlyMap<string, FunctionFrontMatter>;
  now?: () => Date;
  newId?: () => string;
}

export interface TeammateRun {
  card: Card;
  step: WorkStep;
  /** The events appended, in order. */
  events: CardEvent[];
}

/** Every card with whether the AI teammate may pick it, and why not. */
export async function eligibleCards(
  db: Db,
  definitions: ReadonlyMap<string, FunctionFrontMatter> = loadFunctionDefinitions(),
): Promise<Eligibility[]> {
  const teammates = await listTeammates(db);
  const cards = await listCards(db);
  return Promise.all(cards.map(async (card) => checkEligibility(card, await cardLog(db, card.id), definitions, teammates, cards)));
}

/**
 * Run one step. Returns the run, or `null` when no card is eligible. With
 * `cardId`, throws TeammateRefusal when that card is not eligible. The
 * provider is called before anything is appended, so a failing provider
 * leaves the card as it was. The five events are appended in one
 * `appendEvents` write: if any is refused, for example because someone moved
 * the card while the provider worked, none is stored and the store's error is
 * thrown.
 */
export async function runTeammate(db: Db, options: RunOptions): Promise<TeammateRun | null> {
  const definitions = options.definitions ?? loadFunctionDefinitions();
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;

  const teammates = await listTeammates(db);
  const self = teammates.find((t) => t.id === options.teammateId);
  if (self?.kind !== "ai") throw new TeammateRefusal(`${options.teammateId} is not an AI teammate`);

  const all = await eligibleCards(db, definitions);
  let chosen: Eligibility | undefined;
  if (options.cardId !== undefined) {
    chosen = all.find((e) => e.card.id === options.cardId);
    if (!chosen) throw new TeammateRefusal(`no card '${options.cardId}'`);
    if (!chosen.eligible) throw new TeammateRefusal(chosen.reason);
  } else {
    chosen = all.find((e) => e.eligible);
    if (!chosen) return null;
  }
  if (!chosen.eligible) return null;

  const { card, definition, mode, protocol, owner } = chosen;
  const log = await cardLog(db, card.id);
  const step = await options.provider.work({ card, definition, mode, protocol, log, owner, self, teammates });

  const askedOf = teammates.find((t) => t.id === step.question.asked_of);
  if (askedOf?.kind !== "human") {
    throw new TeammateRefusal(
      `${options.provider.name} asked ${step.question.asked_of}, but in ${definition.name}/${mode} decides is human`,
    );
  }

  const at = () => now().toISOString();
  const base = () => ({ id: newId(), card_id: card.id, actor: self.id, at: at() });
  const questionId = newId();
  const events: CardEvent[] = [
    { ...base(), type: "picked", mode },
    { ...base(), type: "status_changed", from: "ready", to: { state: "in_progress" } },
    { ...base(), type: "report_posted", text: step.note },
    {
      ...base(),
      type: "asked",
      question_id: questionId,
      asked_of: askedOf.id,
      text: step.question.text,
      why_it_blocks: step.question.why_it_blocks,
    },
    {
      ...base(),
      type: "status_changed",
      from: "in_progress",
      to: { state: "needs_input", waiting_on: askedOf.id, question_id: questionId },
    },
  ];
  await appendEvents(db, events);
  return { card, step, events };
}
