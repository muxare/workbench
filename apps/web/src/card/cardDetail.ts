// What the card detail screen (the Card artboard) says, derived from
// `GET /api/cards/:id` and the live board. Pure functions; the components only
// lay the result out. How a card is worked comes from its function's front
// matter in the card response, never from fields written here.
import type {
  BoardResponse,
  Card,
  CardEvent,
  CardResponse,
  CardStatus,
  FunctionFrontMatter,
  Mode,
  ProtocolActor,
  Question,
} from "@workbench/shared";
import { columnLabel } from "../board/columns.ts";
import { describeEvent, formatTime } from "../board/log.ts";
import { modeMeaning } from "../board/modes.ts";
import { cardRef, findTeammate, labelOf, roleTitle } from "../board/teammates.ts";

/** Colour of a status, as the artboard and the board columns use them. */
export type StatusTone = "needs-input" | "assist" | "neutral";

export function statusTone(state: CardStatus): StatusTone {
  if (state === "needs_input") return "needs-input";
  if (state === "done") return "assist";
  return "neutral";
}

/** The status pill: "Needs input · waiting on BE", or the column name. */
export function statusText(card: Card, board: BoardResponse): string {
  const label = columnLabel(card.status.state);
  return card.status.state === "needs_input" ? `${label} · waiting on ${labelOf(board, card.status.waiting_on)}` : label;
}

/** A teammate's long name: a person's role title ("Backend developer"), or an AI teammate's "AI". */
export function longLabel(board: BoardResponse, id: string): string {
  const t = findTeammate(board, id);
  if (!t) return id;
  return t.kind === "human" ? roleTitle[t.role] : "AI";
}

/**
 * The mode the card is worked in: its latest `picked` event, or else the mode
 * its owner set for the function, or else the function's default.
 */
export function detailMode(detail: CardResponse, board: BoardResponse): Mode | undefined {
  for (let i = detail.log.length - 1; i >= 0; i -= 1) {
    const e = detail.log[i]!;
    if (e.type === "picked") return e.mode;
  }
  const owner = findTeammate(board, detail.card.owner);
  if (owner?.kind === "human") {
    const set = owner.process_profile[detail.card.function_id];
    if (set) return set;
  }
  return detail.function?.modes.default;
}

/**
 * The mode as said of the card's owner, as in the header pill: "AI assists,
 * BE drives". `modeMeaning` says it in the first person ("AI assists, I drive").
 */
export function modeForOwner(m: Mode, owner: string): string {
  switch (m) {
    case "manual":
      return `${owner} does it`;
    case "assist":
      return `AI assists, ${owner} drives`;
    case "delegate":
      return `AI does it, ${owner} verifies`;
  }
}

/** One protocol role as a person reads it: who opens, asks, writes, decides. */
export function actorText(actor: ProtocolActor, owner: string): string {
  switch (actor) {
    case "human":
      return owner;
    case "ai":
      return "AI";
    case "both":
      return `${owner} and AI`;
    case "none":
      return "Nobody";
  }
}

export interface ProtocolView {
  mode: Mode;
  /** "AI assists, I drive", from the owner's process map. */
  meaning: string;
  cells: { label: string; value: string }[];
  note: string | undefined;
}

export function protocolView(fn: FunctionFrontMatter, m: Mode, ownerTitle: string): ProtocolView | undefined {
  const p = fn.protocols[m];
  if (!p) return undefined;
  return {
    mode: m,
    meaning: modeMeaning[m],
    cells: [
      { label: "Opens", value: actorText(p.opens, ownerTitle) },
      { label: "Asks", value: actorText(p.asks, ownerTitle) },
      { label: "Writes", value: actorText(p.writes, ownerTitle) },
      { label: "Decides", value: actorText(p.decides, ownerTitle) },
    ],
    note: p.note,
  };
}

export interface ArtifactLine {
  artifact: string;
  source: string;
}

/**
 * What the card reads: each input and context artifact with where it comes
 * from. An input made by another function names the card this one depends on
 * for that function when there is one ("from #147"), else the function.
 * External inputs and context are standing material.
 */
export function readsOf(fn: FunctionFrontMatter, card: Card, board: BoardResponse): ArtifactLine[] {
  const dependencies = card.links
    .map((l) => board.cards.find((c) => c.id === l.card_id))
    .filter((c): c is Card => c !== undefined);
  const from = (source: string): string => {
    if (source === "external") return "standing";
    const dep = dependencies.find((c) => c.function_id === source);
    return dep ? `from ${cardRef(dep.id)}` : `from ${source}`;
  };
  return [
    ...fn.inputs.map((i) => ({ artifact: i.artifact, source: i.required ? from(i.from) : `${from(i.from)} · optional` })),
    ...(fn.context ?? []).map((c) => ({ artifact: c.artifact, source: "standing" })),
  ];
}

/** "3 questions, 2 answered". */
export function questionTally(questions: readonly Question[]): string {
  const answered = questions.filter((q) => q.answer !== undefined).length;
  const n = questions.length;
  return `${n} question${n === 1 ? "" : "s"}, ${answered} answered`;
}

export type CheckKind = "structural" | "consistency" | "human";

export interface CheckLine {
  kind: CheckKind;
  name: string;
  by: string;
  result: string;
  tone: "assist" | "needs-input" | "muted";
}

const checkNames: Record<CheckKind, string> = { structural: "Structural", consistency: "Consistency", human: "Human" };

/**
 * The three checks every function has, each with its latest result from the
 * card log. Who checks comes from the function's checks: rules, the AI critic,
 * and the human approver.
 */
export function checkLines(log: readonly CardEvent[], fn: FunctionFrontMatter | null): CheckLine[] {
  const latest = new Map<CheckKind, Extract<CardEvent, { type: "check_ran" }>>();
  for (const e of log) if (e.type === "check_ran") latest.set(e.check, e);
  const by: Record<CheckKind, string> = {
    structural: fn ? `${fn.checks.structural.length} code rules` : "code rules",
    consistency: "AI critic",
    human: fn ? `sign-off by ${fn.checks.human.approver}` : "sign-off",
  };
  return (["structural", "consistency", "human"] as const).map((kind) => {
    const e = latest.get(kind);
    const base = { kind, name: checkNames[kind], by: by[kind] };
    if (!e) return { ...base, result: "Not started", tone: "muted" };
    return e.passed
      ? { ...base, result: `Pass · ${e.summary}`, tone: "assist" }
      : { ...base, result: e.summary, tone: "needs-input" };
  });
}

/**
 * A log time as the artboard writes it: "09:41" on the same day as `now`,
 * the weekday ("Fri") within the last week, and the date ("3 Nov") before that.
 */
export function logTime(at: string, now: Date, timeZone?: string): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "short", ...(timeZone ? { timeZone } : {}) }).format(d);
  const then = new Date(at);
  if (day(then) === day(now)) return formatTime(at, timeZone);
  const zone = timeZone ? { timeZone } : {};
  if (now.getTime() - then.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", ...zone }).format(then);
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...zone }).format(then);
}

export interface CardLogLine {
  id: string;
  at: string;
  time: string;
  text: string;
}

/** The card log, newest first. */
export function cardLogLines(log: readonly CardEvent[], board: BoardResponse, now: Date, timeZone?: string): CardLogLine[] {
  return [...log].reverse().map((e) => ({ id: e.id, at: e.at, time: logTime(e.at, now, timeZone), text: describeEvent(e, board) }));
}

export interface LinkedLine {
  relation: "Depends on" | "Unblocks";
  id: string;
  ref: string;
  title: string;
  status: string;
  tone: StatusTone;
}

/** Cards this one depends on, then the cards that depend on it. */
export function linkedWork(card: Card, board: BoardResponse): LinkedLine[] {
  const line = (relation: LinkedLine["relation"], id: string): LinkedLine => {
    const other = board.cards.find((c) => c.id === id);
    return {
      relation,
      id,
      ref: cardRef(id),
      title: other?.title ?? "",
      status: other ? columnLabel(other.status.state) : "Not on the board",
      tone: other ? statusTone(other.status.state) : "neutral",
    };
  };
  return [
    ...card.links.map((l) => line("Depends on", l.card_id)),
    ...board.cards.filter((c) => c.links.some((l) => l.card_id === card.id)).map((c) => line("Unblocks", c.id)),
  ];
}

export interface OpenQuestionView {
  question: Question;
  /** "AI → Backend developer". */
  route: string;
  at: string | undefined;
  /** The human who answers: the person asked, else the card's owner. Undefined when there is none. */
  answerer: string | undefined;
  answererLabel: string | undefined;
  /** True when the card waits on this question, so answering it resumes the card. */
  resumes: boolean;
}

/**
 * Who answers a question from this screen. There is no sign-in yet, so the
 * answer is given as the person it was asked of; a question asked of an AI is
 * decided by the card's owner, because in every protocol a human decides.
 */
export function answererOf(q: Question, card: Card, board: BoardResponse): string | undefined {
  for (const id of [q.asked_of, card.owner]) {
    if (findTeammate(board, id)?.kind === "human") return id;
  }
  return undefined;
}

export function openQuestions(detail: CardResponse, board: BoardResponse): OpenQuestionView[] {
  const status = detail.card.status;
  return detail.questions
    .filter((q) => q.answer === undefined)
    .map((q) => {
      const asked = detail.log.find((e) => e.type === "asked" && e.question_id === q.id);
      const answerer = answererOf(q, detail.card, board);
      return {
        question: q,
        route: `${labelOf(board, q.asked_by)} → ${longLabel(board, q.asked_of)}`,
        at: asked?.at,
        answerer,
        answererLabel: answerer ? longLabel(board, answerer) : undefined,
        resumes: status.state === "needs_input" && status.question_id === q.id,
      };
    })
    .sort((a, b) => Number(b.resumes) - Number(a.resumes));
}

/** The answer to send, or why it cannot be sent yet. */
export function answerDraft(text: string): { ok: true; answer: string } | { ok: false; reason: string } {
  const answer = text.trim();
  return answer ? { ok: true, answer } : { ok: false, reason: "Write the answer first." };
}
