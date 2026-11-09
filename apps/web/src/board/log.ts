// The cycle log under the board: one line per event, newest first.
import type { BoardResponse, CardEvent } from "@workbench/shared";
import { columnLabel } from "./columns.ts";
import { modeLabel } from "./modes.ts";
import { cardRef, labelOf } from "./teammates.ts";

/** "09:41", 24-hour, in the viewer's time zone unless one is given. */
export function formatTime(at: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(at));
}

export function describeEvent(e: CardEvent, board: BoardResponse): string {
  const who = labelOf(board, e.actor);
  const card = cardRef(e.card_id);
  switch (e.type) {
    case "picked":
      return `${who} picked ${card} · mode: ${modeLabel[e.mode]}`;
    case "asked":
      return `${who} asked ${labelOf(board, e.asked_of)} on ${card}: ${e.text}`;
    case "answered":
      return `${who} answered on ${card}: ${e.answer}`;
    case "check_ran":
      return `${who} ran the ${e.check} check on ${card} · ${e.passed ? "passed" : "failed"}: ${e.summary}`;
    case "status_changed": {
      const to = `${who} moved ${card} to ${columnLabel(e.to.state)}`;
      return e.to.state === "needs_input" ? `${to} · waiting on ${labelOf(board, e.to.waiting_on)}` : to;
    }
    case "report_posted":
      return `${who} posted a report on ${card}: ${e.text}`;
  }
}

export interface LogLine {
  id: string;
  at: string;
  time: string;
  text: string;
}

/** The board's log as lines, newest first. */
export function logLines(board: BoardResponse, timeZone?: string): LogLine[] {
  return [...board.log].reverse().map((e) => ({
    id: e.id,
    at: e.at,
    time: formatTime(e.at, timeZone),
    text: describeEvent(e, board),
  }));
}
