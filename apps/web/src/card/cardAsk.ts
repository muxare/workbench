// What the card screen's "Ask a question" form offers and sends, as pure
// functions; the `AskQuestion` component lays it out and posts the question.
//
// A person may ask while the card is In progress and has no open question.
// The API moves the card to Needs input, waiting on the person asked, and
// refuses a card in any other state with the reason, which the form shows.
//
// Who asks: there is no sign-in, so the asker is chosen under "Asking as",
// which shares the browser's remembered "Changing as" choice from the team
// screen (`changingAsStore.ts`). The card's moves are recorded as its owner,
// but a question is a conversation between two people, and the card log and
// the open question show who asked whom, so fixing the asker to the owner
// would put words in the owner's mouth whenever someone else asks.
import type { AskRequest, BoardResponse, CardResponse, HumanTeammate } from "@workbench/shared";
import { defaultActor, findTeammate, shortLabel } from "../board/teammates.ts";

export interface PersonChoice {
  id: string;
  label: string;
}

export type AskView =
  | { kind: "none" }
  | {
      kind: "ask";
      /** Who the question can be asked as: every person on the team. */
      askers: PersonChoice[];
      /** Who asks unless the person changes it. */
      asker: string;
    };

function people(board: BoardResponse): HumanTeammate[] {
  return board.teammates.filter((t): t is HumanTeammate => t.kind === "human");
}

function choice(p: HumanTeammate): PersonChoice {
  return { id: p.id, label: `${shortLabel(p, p.id)} · ${p.name}` };
}

/**
 * Whether the card screen offers the form, and who asks by default: the
 * person this browser chose last while they are on the team, else the card's
 * owner when a person owns it, else the product owner or the first person.
 */
export function askView(detail: CardResponse, board: BoardResponse, remembered: string | undefined): AskView {
  const { card, questions } = detail;
  if (card.status.state !== "in_progress") return { kind: "none" };
  if (questions.some((q) => q.answer === undefined)) return { kind: "none" };
  const team = people(board);
  const ids = new Set(team.map((p) => p.id));
  const asker = [remembered, card.owner].find((id) => id !== undefined && ids.has(id)) ?? defaultActor(team);
  if (asker === undefined) return { kind: "none" };
  return { kind: "ask", askers: team.map(choice), asker };
}

/**
 * Who a question can be asked of: every person on the team but the asker,
 * the card's owner first. The AI teammate is left out although the API would
 * accept it, because nothing tells the AI a question waits on it, so the card
 * would sit in Needs input until a person answered for it.
 */
export function askedOfChoices(board: BoardResponse, ownerId: string, asker: string): PersonChoice[] {
  const others = people(board).filter((p) => p.id !== asker);
  const owner = others.filter((p) => p.id === ownerId);
  return [...owner, ...others.filter((p) => p.id !== ownerId)].map(choice);
}

/** The person asked unless the asker picks another: the chosen one while still offered, else the first offered. */
export function askedOfDefault(choices: readonly PersonChoice[], chosen: string | undefined): string | undefined {
  return choices.find((c) => c.id === chosen)?.id ?? choices[0]?.id;
}

function nameOf(board: BoardResponse, id: string): string {
  const t = findTeammate(board, id);
  return t ? `${t.name} (${shortLabel(t, id)})` : id;
}

/** What the form says will happen, under its button. */
export function askHint(board: BoardResponse, askedOf: string | undefined): string {
  return askedOf === undefined
    ? "There is no one else on the team to ask."
    : `The card moves to Needs input and waits on ${nameOf(board, askedOf)} until they answer.`;
}

/** The request to send, or why it cannot be sent yet. Text is trimmed. */
export function askDraft(
  asker: string,
  askedOf: string | undefined,
  text: string,
  why: string,
): { ok: true; request: AskRequest } | { ok: false; reason: string } {
  if (askedOf === undefined) return { ok: false, reason: "Choose whom to ask." };
  const question = text.trim();
  if (!question) return { ok: false, reason: "Write the question first." };
  const whyItBlocks = why.trim();
  if (!whyItBlocks) return { ok: false, reason: "Say why the question blocks the work." };
  return { ok: true, request: { actor: asker, asked_of: askedOf, text: question, why_it_blocks: whyItBlocks } };
}
