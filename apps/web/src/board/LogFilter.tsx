// A log's filter: which event types the log shows, for the whole team. Each
// change is saved at once as a `log_filter_changed` event and reaches other
// browsers over the event stream. No artboard draws this control, so it is
// kept small: a disclosure next to the log's heading with one checkbox per
// event type, named by its id in mono as the app names function ids.
import { useEffect, useState } from "react";
import type { BoardResponse, LogName, StreamEventType } from "@workbench/shared";
import { ApiRequestError, setLogFilter } from "../api/client.ts";
import { defaultFilterEditor, filterEditors, filterOptions, filterSummary, toggleHidden } from "./logFilter.ts";
import { labelOf } from "./teammates.ts";

export function LogFilter({
  log,
  board,
  onChanged,
}: {
  log: LogName;
  board: BoardResponse;
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

  const hidden = saved ?? fromBoard;
  const people = filterEditors(board);
  const actor = editor ?? defaultFilterEditor(board);

  const change = (type: StreamEventType, shown: boolean) => {
    if (actor === undefined) return;
    setSaving(true);
    setFailure(undefined);
    setLogFilter(log, { actor, hidden: toggleHidden(hidden, type, shown) }).then(
      (answer) => {
        setSaved(answer.log_filters[log]);
        setSaving(false);
        onChanged?.();
      },
      (err: unknown) => {
        setSaving(false);
        setFailure(err instanceof ApiRequestError ? err.reason : "the filter could not be saved");
      },
    );
  };

  return (
    <details className="log-filter">
      <summary className="log-filter__summary">Filter · {filterSummary(log, hidden)}</summary>
      <div className="log-filter__body">
        <fieldset className="log-filter__types" disabled={saving || actor === undefined} aria-busy={saving}>
          <legend className="log-filter__legend">Shown in the {log} log, for the whole team</legend>
          {filterOptions(log, hidden).map((o) => (
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
