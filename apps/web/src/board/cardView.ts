// What a card tile and a teammate panel say, derived from the board response.
import { unfinishedDependencies, type BoardResponse, type Card } from "@workbench/shared";
import { cardMode, cardParticipants, isActive } from "./links.ts";
import { cardRef, findTeammate, labelOf } from "./teammates.ts";

export type Tone = "muted" | "needs-input" | "assist";

export interface Note {
  text: string;
  tone: Tone;
  strong?: boolean;
}

function openQuestionsOn(card: Card, board: BoardResponse) {
  return board.open_questions.filter((q) => q.card_id === card.id && q.answer === undefined);
}

/** The avatars on a tile: everyone on an active card, nobody on a card not started or done (as on the artboard). */
export function cardAvatars(card: Card, board: BoardResponse): string[] {
  return isActive(card) ? cardParticipants(card, board) : [];
}

/** The mode pill, shown only while the card is being worked. */
export function cardPill(card: Card, board: BoardResponse) {
  return isActive(card) ? cardMode(card, board) : undefined;
}

/** The card's border: red while it waits, green once done with a report posted. */
export function cardTone(card: Card, board: BoardResponse): "default" | "needs-input" | "assist" {
  if (card.status.state === "needs_input") return "needs-input";
  if (card.status.state === "done" && board.log.some((e) => e.type === "report_posted" && e.card_id === card.id)) {
    return "assist";
  }
  return "default";
}

/** The lines under a card's title. */
export function cardNotes(card: Card, board: BoardResponse): Note[] {
  const notes: Note[] = [];
  const status = card.status;

  if (status.state === "needs_input") {
    const waitingOn = findTeammate(board, status.waiting_on);
    const label = labelOf(board, status.waiting_on);
    notes.push({
      text: waitingOn?.kind === "ai" ? `Waiting on AI` : `Waiting on a person: ${label}`,
      tone: "needs-input",
      strong: true,
    });
  } else if (status.state !== "done") {
    const open = openQuestionsOn(card, board).length;
    if (open > 0) notes.push({ text: `${open} open question${open === 1 ? "" : "s"}`, tone: "needs-input" });
  }

  if (status.state !== "done") {
    const blockers = unfinishedDependencies(card, board.cards);
    if (blockers.length > 0) notes.push({ text: `Blocked by ${blockers.map(cardRef).join(", ")}`, tone: "muted" });
  }

  if (status.state === "review") {
    const owner = labelOf(board, card.owner);
    notes.push({ text: cardMode(card, board) === "delegate" ? `${owner} verifies` : `${owner} reviews`, tone: "muted" });
  }

  if (status.state === "done") {
    const reported = board.log.some((e) => e.type === "report_posted" && e.card_id === card.id);
    const checks = checkTally(card, board);
    const parts = [reported ? "Report posted" : undefined, checks ? `checks ${checks.passed}/${checks.ran}` : undefined];
    const text = parts.filter((p) => p !== undefined).join(" · ");
    if (text) notes.push({ text, tone: reported ? "assist" : "muted", strong: reported });
  }

  return notes;
}

/**
 * Of the checks that ran on a card (one per kind, latest result wins), how
 * many passed. Undefined when none ran in the log.
 */
export function checkTally(card: Card, board: BoardResponse): { passed: number; ran: number } | undefined {
  const latest = new Map<string, boolean>();
  for (const e of board.log) if (e.type === "check_ran" && e.card_id === card.id) latest.set(e.check, e.passed);
  if (latest.size === 0) return undefined;
  return { passed: [...latest.values()].filter(Boolean).length, ran: latest.size };
}

/**
 * The milestone most cards work toward, and how many of its cards are done
 * (the artboard's "Toward Self-service onboarding · 7 of 12").
 */
export function milestoneProgress(cards: readonly Card[]): { name: string; done: number; total: number } | undefined {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.milestone) counts.set(c.milestone, (counts.get(c.milestone) ?? 0) + 1);
  let name: string | undefined;
  for (const [m, n] of counts) if (name === undefined || n > counts.get(name)!) name = m;
  if (name === undefined) return undefined;
  const ofMilestone = cards.filter((c) => c.milestone === name);
  return { name, done: ofMilestone.filter((c) => c.status.state === "done").length, total: ofMilestone.length };
}

/** The status lines in a teammate's panel ("Now: #142", "1 question waiting for me", …). */
export function teammateNotes(teammateId: string, board: BoardResponse): Note[] {
  const notes: Note[] = [];
  const teammate = findTeammate(board, teammateId);
  const refs = (cards: readonly Card[]) => cards.map((c) => cardRef(c.id)).join(" · ");

  const verifying = board.cards.filter(
    (c) => c.status.state === "review" && c.owner === teammateId && teammate?.kind === "human",
  );
  const now = board.cards.filter(
    (c) => isActive(c) && !verifying.includes(c) && cardParticipants(c, board).includes(teammateId),
  );
  if (now.length > 0) notes.push({ text: `Now: ${refs(now)}`, tone: "muted" });

  let finished: string | undefined;
  for (let i = board.log.length - 1; i >= 0 && finished === undefined; i -= 1) {
    const e = board.log[i]!;
    if (e.type === "status_changed" && e.actor === teammateId && e.to.state === "done") finished = e.card_id;
  }
  if (finished) notes.push({ text: `Just finished ${cardRef(finished)}`, tone: "muted" });

  if (verifying.length > 0) notes.push({ text: `Next: verify ${refs(verifying)}`, tone: "muted" });

  const open = board.open_questions.filter((q) => q.answer === undefined);
  const forMe = open.filter((q) => q.asked_of === teammateId);
  if (forMe.length > 0) {
    notes.push({
      text: `${forMe.length} question${forMe.length === 1 ? "" : "s"} waiting for me`,
      tone: "needs-input",
    });
  }
  for (const q of open.filter((q) => q.asked_by === teammateId)) {
    notes.push({ text: `Waiting on ${labelOf(board, q.asked_of)} for ${cardRef(q.card_id)}`, tone: "needs-input" });
  }

  const waiting = board.cards.filter((c) => c.status.state === "needs_input" && c.status.waiting_on === teammateId);
  if (waiting.length > 0) {
    const blocked = new Set(waiting.map((c) => c.id));
    for (const c of board.cards) {
      if (c.status.state !== "done" && unfinishedDependencies(c, board.cards).some((id) => blocked.has(id))) {
        blocked.add(c.id);
      }
    }
    const list = [...blocked].map(cardRef);
    const text = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list.at(-1)!}`;
    notes.push({ text: `Blocks ${text}`, tone: "needs-input" });
  }

  if (notes.length === 0) notes.push({ text: "Nothing on the board right now", tone: "muted" });
  return notes;
}
