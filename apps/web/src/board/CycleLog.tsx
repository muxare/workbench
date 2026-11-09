import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { logLines } from "./log.ts";

const SHOWN = 6;

export function CycleLog({ board }: { board: BoardResponse }) {
  const [all, setAll] = useState(false);
  const lines = logLines(board);
  const shown = all ? lines : lines.slice(0, SHOWN);
  return (
    <section className="cycle-log" aria-label="Cycle log">
      <h3 className="cycle-log__head">Cycle log</h3>
      {lines.length === 0 && <p className="cycle-log__line">Nothing has happened yet.</p>}
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
