// An AI teammate's profile. It has no modes of its own: it works in the mode
// each card's owner set for the step. So everything here is derived: which
// steps it may work from the people's modes (through `ownerMode`) and the
// function files (through `workableMode`), which cards it may pick next from
// the runner's own eligibility check, and what it did from the event stream.
// Nothing names a function or copies a function field.
import type {
  AiProfileStep,
  AiTeammate,
  AiTeammateProfileResponse,
  Card,
  CardEvent,
  CardStatus,
  FunctionFrontMatter,
  Mode,
  Question,
  Teammate,
} from "@workbench/shared";
import type { Db } from "./db/client.ts";
import { chainOf } from "./profile.ts";
import { boardLog, listCards, listQuestions, listTeammates } from "./store.ts";
import { ownerMode, TEAMMATE_MODES, workableMode, type HumanTeammate } from "./teammates/eligibility.ts";
import { eligibleCards } from "./teammates/runner.ts";

/** How many of the teammate's latest events the profile shows. */
export const RECENT_LIMIT = 10;

/** Statuses in which a card the AI picked is still being worked. */
const ACTIVE: readonly CardStatus[] = ["in_progress", "needs_input", "review"];

/**
 * The people who own `definition`: everyone whose own profile lists it
 * (`chainOf`, the rule the person's profile uses), then anyone else who owns
 * a card on it, since eligibility reads the mode of `card.owner`.
 */
function ownersOf(
  definition: FunctionFrontMatter,
  people: readonly HumanTeammate[],
  definitions: ReadonlyMap<string, FunctionFrontMatter>,
  cards: readonly Card[],
): HumanTeammate[] {
  const listed = people.filter((p) => chainOf(p, definitions).some((d) => d.name === definition.name));
  const byCard = people.filter(
    (p) => !listed.includes(p) && cards.some((c) => c.function_id === definition.name && c.owner === p.id),
  );
  return [...listed, ...byCard];
}

/**
 * Every function in `definitions`, in file order, with each owner's mode and
 * whether the AI may pick their cards on it, by the same `workableMode` check
 * the runner's eligibility uses.
 */
export function aiSteps(
  definitions: ReadonlyMap<string, FunctionFrontMatter>,
  teammates: readonly Teammate[],
  cards: readonly Card[],
): AiProfileStep[] {
  const people = teammates.filter((t): t is HumanTeammate => t.kind === "human");
  return [...definitions.values()].map((definition) => ({
    function_id: definition.name,
    role: definition.role,
    title: definition.title,
    summary: definition.summary,
    owners: ownersOf(definition, people, definitions, cards).map((person) => {
      const mode = ownerMode(person, definition);
      const work = workableMode(definition, mode);
      return { teammate_id: person.id, mode, ai_may_pick: work.ok, reason: work.ok ? null : work.reason };
    }),
  }));
}

/** The cards `self` picked last that are still being worked, with the mode of that pick. */
export function cardsInHand(selfId: string, cards: readonly Card[], log: readonly CardEvent[]): { card: Card; mode: Mode }[] {
  const lastPick = new Map<string, { actor: string; mode: Mode }>();
  for (const e of log) if (e.type === "picked") lastPick.set(e.card_id, { actor: e.actor, mode: e.mode });
  return cards.flatMap((card) => {
    const pick = lastPick.get(card.id);
    return pick?.actor === selfId && ACTIVE.includes(card.status.state) ? [{ card, mode: pick.mode }] : [];
  });
}

/** Questions `selfId` asked: open ones first, then the latest first. */
export function questionsAsked(selfId: string, questions: readonly Question[]): Question[] {
  const mine = questions.filter((q) => q.asked_by === selfId).reverse();
  return [...mine.filter((q) => q.answer === undefined), ...mine.filter((q) => q.answer !== undefined)];
}

/** The latest `limit` events whose actor is `selfId`, newest first. */
export function recentEvents(selfId: string, log: readonly CardEvent[], limit = RECENT_LIMIT): CardEvent[] {
  return log.filter((e) => e.actor === selfId).slice(-limit).reverse();
}

export interface AiProfileOptions {
  definitions: ReadonlyMap<string, FunctionFrontMatter>;
  /** The provider's name, such as "stub". */
  provider: string;
  /** The timer's interval when it runs this teammate, else undefined. */
  timerIntervalMs: number | undefined;
}

/** The profile of the AI teammate `self`, read from the store and `definitions`. */
export async function buildAiProfile(db: Db, self: AiTeammate, options: AiProfileOptions): Promise<AiTeammateProfileResponse> {
  const { definitions } = options;
  const [teammates, cards, log, questions, eligibility] = await Promise.all([
    listTeammates(db),
    listCards(db),
    boardLog(db),
    listQuestions(db),
    eligibleCards(db, definitions),
  ]);
  const ready = eligibility.filter((e) => e.card.status.state === "ready");
  return {
    teammate: self,
    works_in: [...TEAMMATE_MODES],
    provider: options.provider,
    timer: options.timerIntervalMs === undefined ? null : { interval_ms: options.timerIntervalMs },
    steps: aiSteps(definitions, teammates, cards),
    now: cardsInHand(self.id, cards, log),
    next: ready.flatMap((e) => (e.eligible ? [{ card: e.card, mode: e.mode }] : [])),
    not_next: ready.flatMap((e) => {
      if (e.eligible) return [];
      // checkEligibility prefixes the card id; the profile shows the card beside the reason.
      const prefix = `${e.card.id}: `;
      return [{ card: e.card, reason: e.reason.startsWith(prefix) ? e.reason.slice(prefix.length) : e.reason }];
    }),
    questions: questionsAsked(self.id, questions),
    recent: recentEvents(self.id, log),
  };
}
