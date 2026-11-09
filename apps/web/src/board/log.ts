// The cycle log under the board: one line per event, newest first. Events
// about a card and events about a teammate, such as a mode change, share it.
import type { BoardResponse, StreamEvent } from "@workbench/shared";
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

export function describeEvent(e: StreamEvent, board: BoardResponse): string {
  const who = labelOf(board, e.actor);
  if (e.type === "mode_changed") {
    const whose = e.teammate_id === e.actor ? "their" : `${labelOf(board, e.teammate_id)}'s`;
    const was = e.from === null ? "the default" : modeLabel[e.from];
    return `${who} changed ${whose} mode for ${e.function_id} to ${modeLabel[e.to]} · was: ${was}`;
  }
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
