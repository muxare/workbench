import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { BOARD_PANEL_LOG, cycleWindow, emptyCycleLog, logLines } from "./log.ts";
import { LogFilter } from "./LogFilter.tsx";

const SHOWN = 6;

/** The cycle log under the board: the current cycle's events, newest first, under the cycle log's filter. */
export function CycleLog({ board, onFilterChanged }: { board: BoardResponse; onFilterChanged?: (() => void) | undefined }) {
  const [all, setAll] = useState(false);
  const lines = logLines(board, new Date());
  const shown = all ? lines : lines.slice(0, SHOWN);
  const empty = emptyCycleLog(board, lines.length);
  const current = board.cycle;
  return (
    <section className="cycle-log" aria-label="Cycle log">
      <div className="cycle-log__top">
        <h3 className="cycle-log__head">
          Cycle log
          {current && (
            <span
              className="cycle-log__window"
              title={current.ended ? "This cycle has ended; later events belong to no cycle." : undefined}
            >
              {" "}
              · {cycleWindow(current.cycle)}
              {current.ended && " · ended"}
            </span>
          )}
        </h3>
        <LogFilter log={BOARD_PANEL_LOG} board={board} onChanged={onFilterChanged} />
      </div>
      {empty !== undefined && <p className="cycle-log__line">{empty}</p>}
      <ol className="cycle-log__lines">
        {shown.map((l) => (
          <li key={l.id} className="cycle-log__line">
            <time dateTime={l.at}>{l.time}</time> {l.text}
          </li>
        ))}
      </ol>
      {lines.length > SHOWN && (
        <button type="button" className="cycle-log__more" onClick={() => setAll(!all)}>
          {all ? "Show the latest only" : `Show all ${lines.length}`}
        </button>
      )}
    </section>
  );
}
