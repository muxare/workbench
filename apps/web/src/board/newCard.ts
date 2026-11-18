// What the board's "New card" form offers and sends, as pure functions; the
// `NewCard` component lays it out and posts the card with `POST /api/cards`.
//
// The functions offered are the ones `GET /api/board` reads from process/
// (`board.functions`), in file order, so no function is named in the web app.
// The owner is chosen from the people on the team; the AI teammate is left
// out, because it has no process profile, so a card it owned could never be
// picked. Who creates the card is chosen under "Creating as", which shares the
// browser's remembered "Changing as" choice (`changingAsStore.ts`), as the
// card screen's "Asking as" does.
import type { BoardResponse, CreateCardRequest, HumanTeammate } from "@workbench/shared";
import { cardHref } from "../route.ts";
import { cardRef, defaultActor, mainRole, shortLabel } from "./teammates.ts";

export interface Choice {
  id: string;
  label: string;
}

function people(board: BoardResponse): HumanTeammate[] {
  return board.teammates.filter((t): t is HumanTeammate => t.kind === "human");
}

function personChoice(p: HumanTeammate): Choice {
  return { id: p.id, label: `${shortLabel(p, p.id)} · ${p.name}` };
}

/** Every person on the team, as "Creating as" and "Owner" list them. */
export function personChoices(board: BoardResponse): Choice[] {
  return people(board).map(personChoice);
}

/**
 * Who the card is created as unless the person changes it: the person this
 * browser chose last while they are on the team, else the product owner or
 * the first person. Undefined on a team with no person, where nobody may create.
 */
export function creatorDefault(board: BoardResponse, remembered: string | undefined): string | undefined {
  const team = people(board);
  return team.some((p) => p.id === remembered) ? remembered : defaultActor(team);
}

/** The functions from process/, in file order, each with the role that owns it: "implement_interactions · FE". */
export function functionChoices(board: BoardResponse): Choice[] {
  return board.functions.map((f) => ({ id: f.name, label: `${f.name} · ${f.role.toUpperCase()}` }));
}

/**
 * Who owns the card unless the person picks someone: the one person whose
 * main role is the function's role; else the one person who holds that role
 * at all; else the creator. A person who holds every role, such as a founder,
 * then does not take every card from the one teammate seated in that role.
 */
export function ownerDefault(board: BoardResponse, functionId: string | undefined, creator: string | undefined): string | undefined {
  const role = board.functions.find((f) => f.name === functionId)?.role;
  if (role !== undefined) {
    const team = people(board);
    const main = team.filter((p) => mainRole(p) === role);
    if (main.length === 1) return main[0]!.id;
    const holding = team.filter((p) => p.roles.some((r) => r === role));
    if (holding.length === 1) return holding[0]!.id;
  }
  return creator;
}

/** The owner shown: the person chosen while they are still on the team, else the default. */
export function ownerShown(board: BoardResponse, chosen: string | undefined, fallback: string | undefined): string | undefined {
  return people(board).some((p) => p.id === chosen) ? chosen : fallback;
}

/** The milestones the board's cards already name, each once, in board order, offered as suggestions. */
export function milestoneChoices(board: BoardResponse): string[] {
  return [...new Set(board.cards.flatMap((c) => (c.milestone === undefined ? [] : [c.milestone])))];
}

/** The request to send, or why it cannot be sent yet. Title and milestone are trimmed; an empty milestone is left out. */
export function newCardDraft(fields: {
  creator: string | undefined;
  title: string;
  functionId: string | undefined;
  owner: string | undefined;
  milestone: string;
}): { ok: true; request: CreateCardRequest } | { ok: false; reason: string } {
  if (fields.creator === undefined) return { ok: false, reason: "Choose who creates the card." };
  const title = fields.title.trim();
  if (!title) return { ok: false, reason: "Write a title first." };
  if (!fields.functionId) return { ok: false, reason: "Choose the function the card is worked as." };
  if (fields.owner === undefined) return { ok: false, reason: "Choose who owns the card." };
  const milestone = fields.milestone.trim();
  return {
    ok: true,
    request: {
      actor: fields.creator,
      title,
      function_id: fields.functionId,
      owner: fields.owner,
      ...(milestone ? { milestone } : {}),
    },
  };
}

/** What the form says once the API has accepted the card: its number and the link to it. */
export function createdNote(cardId: string): { text: string; ref: string; href: string } {
  const ref = cardRef(cardId);
  return { text: `Created ${ref} in Backlog.`, ref, href: cardHref(cardId) };
}
