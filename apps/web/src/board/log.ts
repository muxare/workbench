// Log lines as the board and card detail show them, and the cycle log under
// the board: one line per event, newest first. Events about a card, a
// teammate (a mode or roles change) and the team (a filter, critic gate or name change) share it. It shows
// the current cycle's log (`board.cycle`), so the cycle log's filter applies.
import { shownInLog, type BoardResponse, type Cycle, type LogName, type StreamEvent } from "@workbench/shared";
import { columnLabel } from "./columns.ts";
import { modeLabel } from "./modes.ts";
import { cardRef, externalLabel, labelOf, waitingOnLabel } from "./teammates.ts";

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
  if (e.type === "roles_changed") {
    const roles = (list: readonly string[]) => list.map((r) => r.toUpperCase()).join(", ");
    if (e.from.length === 0) return `${labelOf(board, e.teammate_id)} joined the team as ${roles(e.to)}`;
    const whose = e.teammate_id === e.actor ? "their" : `${labelOf(board, e.teammate_id)}'s`;
    return `${who} changed ${whose} roles to ${roles(e.to)} · was: ${roles(e.from)}`;
  }
  if (e.type === "log_filter_changed") {
    const hides = e.hidden.length === 0 ? "shows every event type" : `hides ${e.hidden.join(", ")}`;
    return `${who} changed the ${e.log} log filter · now ${hides}`;
  }
  if (e.type === "critic_gate_changed") {
    const now = e.required ? "must pass before a person approves" : "is optional before a person approves";
    return `${who} changed the AI critic for ${e.function_id} · now ${now}`;
  }
  if (e.type === "team_named") {
    const now = e.to.headline === undefined ? `'${e.to.name}'` : `'${e.to.name}', headline '${e.to.headline}'`;
    return e.from === null ? `${who} named the team ${now}` : `${who} renamed the team ${now} · was: '${e.from.name}'`;
  }
  const card = cardRef(e.card_id);
  switch (e.type) {
    case "picked":
      return `${who} picked ${card} · mode: ${modeLabel[e.mode]}`;
    case "asked":
      return e.external
        ? `${who} asked ${externalLabel(e.external)} through ${labelOf(board, e.asked_of)} on ${card}: ${e.text}`
        : `${who} asked ${labelOf(board, e.asked_of)} on ${card}: ${e.text}`;
    case "answered":
      return `${who} answered on ${card}: ${e.answer}`;
    case "check_ran":
      return `${who} ran the ${e.check} check on ${card} · ${e.passed ? "passed" : "failed"}: ${e.summary}`;
    case "status_changed": {
      const to = `${who} moved ${card} to ${columnLabel(e.to.state)}`;
      return e.to.state === "needs_input" ? `${to} · waiting on ${waitingOnLabel(board, e.to.waiting_on)}` : to;
    }
    case "report_posted":
      return `${who} posted a report on ${card}: ${e.text}`;
    case "workspace_linked":
      return `${who} linked ${card} to the branch ${e.branch} in ${e.repository}`;
    case "work_pushed": {
      const commits = e.commits === 1 ? "1 commit" : `${String(e.commits)} commits`;
      return `${who} pushed ${commits} to ${e.branch} for ${card}${e.forced ? " · forced" : ""}`;
    }
    case "review_requested":
      return `${who} asked for a review of ${card} · pull request #${String(e.pull_request)}: ${e.title}`;
    case "approved":
      return `${who} approved ${card} · pull request #${String(e.pull_request)}`;
    case "changes_requested":
      return `${who} requested changes on ${card} · pull request #${String(e.pull_request)}`;
  }
}

export interface LogLine {
  id: string;
  at: string;
  time: string;
  text: string;
}

/** The log under the board is the current cycle's log, so it takes the cycle log's filter. */
export const BOARD_PANEL_LOG: LogName = "cycle";

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

/** The current cycle's log as lines, newest first, without the event types the cycle filter hides. */
export function logLines(board: BoardResponse, now: Date, timeZone?: string): LogLine[] {
  const log = board.cycle?.log ?? [];
  return shownInLog(log, board.log_filters, BOARD_PANEL_LOG).reverse().map((e) => ({
    id: e.id,
    at: e.at,
    time: logTime(e.at, now, timeZone),
    text: describeEvent(e, board),
  }));
}

/**
 * The cycle's window as the panel heads it: "28 Sep – 12 Oct", with the year
 * only when the two ends fall in different years. The end is the first
 * moment after the cycle, as stored.
 */
export function cycleWindow(c: Cycle, timeZone?: string): string {
  const zone = timeZone ? { timeZone } : {};
  const year = (at: string) => new Intl.DateTimeFormat("en-GB", { year: "numeric", ...zone }).format(new Date(at));
  const withYear = year(c.starts_at) !== year(c.ends_at);
  const date = (at: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), ...zone }).format(new Date(at));
  return `${date(c.starts_at)} – ${date(c.ends_at)}`;
}

/** What the panel says when it shows no lines, or undefined when it shows some. */
export function emptyCycleLog(board: BoardResponse, shown: number): string | undefined {
  if (shown > 0) return undefined;
  if (board.cycle === null) return "No cycle has started yet.";
  if (board.cycle.log.length === 0) return "Nothing has happened in this cycle yet.";
  return "The filter hides every event in this cycle.";
}
