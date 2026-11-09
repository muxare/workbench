// The AI teammate's profile as the screen shows it: pure functions over the
// API's AI profile and the live board (for teammate labels). There is no
// artboard for this screen; it follows the Profile artboard's layout, and the
// AI's own panel on the Main artboard for how the AI is drawn. Nothing here
// names a function or a function field's value.
import type { AiProfileStep, AiTeammateProfileResponse, BoardResponse, Mode } from "@workbench/shared";
import { columnLabel } from "../board/columns.ts";
import { describeEvent, formatTime } from "../board/log.ts";
import { modeMeaning, modes } from "../board/modes.ts";
import { cardRef, labelOf } from "../board/teammates.ts";
import { cardHref } from "../route.ts";

export interface OwnerChip {
  teammateId: string;
  /** The owner's short label, such as "FE". */
  label: string;
  mode: Mode;
  mayPick: boolean;
  /** Why the AI may not pick this owner's cards on the step; undefined when it may. */
  reason: string | undefined;
}

export interface AiStepRow {
  functionId: string;
  title: string;
  summary: string;
  /** "role · function", as the person's profile writes a step's sub-line. */
  subline: string;
  owners: OwnerChip[];
}

export function aiStepRows(steps: readonly AiProfileStep[], board: BoardResponse): AiStepRow[] {
  return steps.map((s) => ({
    functionId: s.function_id,
    title: s.title,
    summary: s.summary,
    subline: `${s.role} · ${s.function_id}`,
    owners: s.owners.map((o) => ({
      teammateId: o.teammate_id,
      label: labelOf(board, o.teammate_id),
      mode: o.mode,
      mayPick: o.ai_may_pick,
      reason: o.reason ?? undefined,
    })),
  }));
}

export interface OwnerModeShare {
  mode: Mode;
  count: number;
  /** Share of all owner rows, in percent with one decimal. */
  percent: number;
}

/** How many owner rows (a person on a step) are in each mode, in mode order: the bar under the heading. */
export function ownerModeShares(steps: readonly AiProfileStep[]): OwnerModeShare[] {
  const all = steps.flatMap((s) => s.owners);
  return modes.map((mode) => {
    const count = all.filter((o) => o.mode === mode).length;
    return { mode, count, percent: all.length === 0 ? 0 : Math.round((count / all.length) * 1000) / 10 };
  });
}

/** On how many owner rows the AI may pick, of how many. */
export function pickCount(steps: readonly AiProfileStep[]): { may: number; total: number } {
  const all = steps.flatMap((s) => s.owners);
  return { may: all.filter((o) => o.ai_may_pick).length, total: all.length };
}

/**
 * The header's facts about how the AI runs: the modes it works in, the
 * modes with an AI part it does not work in yet, and what starts a run.
 */
export function runFacts(profile: AiTeammateProfileResponse): { worksIn: string; notYet: string | undefined; runs: string } {
  // `manual` is "I do it": the AI has no part in it, so it is never "not yet".
  const notYet = modes.filter((m) => m !== "manual" && !profile.works_in.includes(m));
  const seconds = profile.timer ? profile.timer.interval_ms / 1000 : undefined;
  return {
    worksIn: profile.works_in.map((m) => modeMeaning[m]).join(", "),
    notYet: notYet.length === 0 ? undefined : notYet.map((m) => modeMeaning[m]).join(", "),
    runs:
      seconds === undefined
        ? `Runs when someone starts it · ${profile.provider} provider`
        : `Runs on its own every ${String(seconds)} s · ${profile.provider} provider`,
  };
}

export type Tone = "plain" | "muted" | "needs-input";

export interface CardItem {
  id: string;
  ref: string;
  href: string;
  title: string;
  /** The status, or who the card waits on. */
  note: string;
  tone: Tone;
  mode: Mode;
}

/** The cards the AI is on now. A card in Needs input says whom it waits on. */
export function nowItems(profile: AiTeammateProfileResponse, board: BoardResponse): CardItem[] {
  return profile.now.map(({ card, mode }) => ({
    id: card.id,
    ref: cardRef(card.id),
    href: cardHref(card.id),
    title: card.title,
    note: card.status.state === "needs_input" ? `Waiting on ${labelOf(board, card.status.waiting_on)}` : columnLabel(card.status.state),
    tone: card.status.state === "needs_input" ? "needs-input" : "plain",
    mode,
  }));
}

/** The Ready cards the AI may pick, in the order a run takes them; the first is the next run's. */
export function nextItems(profile: AiTeammateProfileResponse, board: BoardResponse): CardItem[] {
  return profile.next.map(({ card, mode }, i) => ({
    id: card.id,
    ref: cardRef(card.id),
    href: cardHref(card.id),
    title: card.title,
    note: `${i === 0 ? "Next run · " : ""}owner ${labelOf(board, card.owner)}`,
    tone: i === 0 ? "plain" : "muted",
    mode,
  }));
}

export interface RefusedItem {
  id: string;
  ref: string;
  href: string;
  title: string;
  reason: string;
}

/** The Ready cards the AI may not pick, and why. */
export function notNextItems(profile: AiTeammateProfileResponse): RefusedItem[] {
  return profile.not_next.map(({ card, reason }) => ({
    id: card.id,
    ref: cardRef(card.id),
    href: cardHref(card.id),
    title: card.title,
    reason,
  }));
}

export interface QuestionItem {
  id: string;
  ref: string;
  href: string;
  text: string;
  /** "Waiting on BE", or "PO answered: …". */
  status: string;
  open: boolean;
}

/** The questions the AI asked, open first, as the API orders them. */
export function questionItems(profile: AiTeammateProfileResponse, board: BoardResponse): QuestionItem[] {
  return profile.questions.map((q) => {
    const open = q.answer === undefined;
    return {
      id: q.id,
      ref: cardRef(q.card_id),
      href: cardHref(q.card_id),
      text: q.text,
      status: open ? `Waiting on ${labelOf(board, q.asked_of)}` : `${labelOf(board, q.decided_by ?? q.asked_of)} answered: ${q.answer ?? ""}`,
      open,
    };
  });
}

/** The AI's latest events as log lines, newest first, worded as in the cycle log. */
export function recentLines(profile: AiTeammateProfileResponse, board: BoardResponse, timeZone?: string) {
  return profile.recent.map((e) => ({ id: e.id, at: e.at, time: formatTime(e.at, timeZone), text: describeEvent(e, board) }));
}

/**
 * When the profile is out of date. Only what the profile is built from counts:
 * each card's status and owner (which cards are Ready, in hand or done, and
 * whose mode applies), the teammates (a person's mode decides where the AI
 * may pick), every pick, question and answer (who has a card, what the AI
 * asked and how it was answered), and every event of the AI's own. A check or
 * a report by someone else changes nothing on the profile, so it does not
 * cause a refetch.
 */
export function aiProfileRefreshKey(board: BoardResponse, aiId: string): string {
  const cards = board.cards.map((c) => [c.id, c.owner, c.status]);
  const events = board.log
    .filter((e) => e.actor === aiId || e.type === "picked" || e.type === "asked" || e.type === "answered")
    .map((e) => e.id);
  return JSON.stringify([cards, board.teammates, events]);
}
