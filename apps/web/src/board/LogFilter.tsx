// A log's filter: which event types the log shows, for the whole team. Each
// change is saved at once as a `log_filter_changed` event and reaches other
// browsers over the event stream. No artboard draws this control, so it is
// kept small: a disclosure next to the log's heading with one checkbox per
// event type, named by its id in mono as the app names function ids.
import { useEffect, useRef, useState } from "react";
import type { BoardResponse, LogName, StreamEventType } from "@workbench/shared";
import { setLogFilter } from "../api/client.ts";
import {
  defaultFilterEditor,
  filterEditors,
  filterOptions,
  filterSummary,
  saveFailure,
  shownAfterSave,
  toggleHidden,
} from "./logFilter.ts";
import { labelOf } from "./teammates.ts";

export function LogFilter({
  log,
  board,
  onChanged,
  offered,
}: {
  log: LogName;
  board: BoardResponse;
  /** The event types to offer, where a screen shows only part of the log; by default every type the log can hold. */
  offered?: readonly StreamEventType[] | undefined;
  /** Called after a change is saved, so the board can refetch without waiting for the stream. */
  onChanged?: (() => void) | undefined;
}) {
  const fromBoard = board.log_filters[log];
  // The saved answer, shown until the board catches up over the stream.
  const [saved, setSaved] = useState<StreamEventType[] | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<string | undefined>(undefined);
  const boardKey = fromBoard.join(",");
  useEffect(() => setSaved(undefined), [boardKey]);
  // The board's filter as of now, for an answer that arrives after it has moved on.
  const latest = useRef(fromBoard);
  useEffect(() => {
    latest.current = fromBoard;
  });

  const hidden = saved ?? fromBoard;
  const people = filterEditors(board);
  const actor = editor ?? defaultFilterEditor(board);

  const change = (type: StreamEventType, shown: boolean) => {
    if (actor === undefined) return;
    setSaving(true);
    setFailure(undefined);
    // `was_hidden` is what this view shows, so a change made from a stale view is refused with 409.
    const madeFrom = fromBoard;
    setLogFilter(log, { actor, hidden: toggleHidden(hidden, type, shown), was_hidden: hidden }).then(
      (answer) => {
        setSaved(shownAfterSave(madeFrom, latest.current, answer.log_filters[log]));
        setSaving(false);
        onChanged?.();
      },
      (err: unknown) => {
        setSaved(undefined);
        setSaving(false);
        setFailure(saveFailure(err));
        onChanged?.();
      },
    );
  };

  return (
    <details className="log-filter">
      <summary className="log-filter__summary">Filter · {filterSummary(log, hidden, offered)}</summary>
      <div className="log-filter__body">
        <fieldset className="log-filter__types" disabled={saving || actor === undefined} aria-busy={saving}>
          <legend className="log-filter__legend">Shown in the {log} log, for the whole team</legend>
          {filterOptions(log, hidden, offered).map((o) => (
            <label key={o.type} className="log-filter__type">
              <input type="checkbox" checked={o.shown} onChange={(e) => change(o.type, e.target.checked)} />
              <span className="mono">{o.type}</span>
            </label>
          ))}
        </fieldset>
        {people.length > 0 && (
          <label className="log-filter__as">
            Changing as
            <select value={actor} onChange={(e) => setEditor(e.target.value)} disabled={saving}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {labelOf(board, p.id)} · {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {saving && (
          <span className="log-filter__status" role="status">
            Saving…
          </span>
        )}
        {failure !== undefined && (
          <span className="log-filter__failure" role="alert">
            Not saved: {failure}
          </span>
        )}
      </div>
    </details>
  );
}
