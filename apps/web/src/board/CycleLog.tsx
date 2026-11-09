import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { BOARD_PANEL_LOG, logLines } from "./log.ts";
import { LogFilter } from "./LogFilter.tsx";

const SHOWN = 6;

export function CycleLog({ board, onFilterChanged }: { board: BoardResponse; onFilterChanged?: (() => void) | undefined }) {
  const [all, setAll] = useState(false);
  const lines = logLines(board);
  const shown = all ? lines : lines.slice(0, SHOWN);
  return (
    <section className="cycle-log" aria-label="Cycle log">
      <div className="cycle-log__top">
        <h3 className="cycle-log__head">Cycle log</h3>
        <LogFilter log={BOARD_PANEL_LOG} board={board} onChanged={onFilterChanged} />
      </div>
      {lines.length === 0 && (
        <p className="cycle-log__line">{board.log.length === 0 ? "Nothing has happened yet." : "The filter hides every recent event."}</p>
      )}
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
