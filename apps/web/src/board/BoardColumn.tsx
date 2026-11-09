import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { CardTile } from "./CardTile.tsx";
import type { Column } from "./columns.ts";

/** Done collapses to its first cards and a "+N more" toggle, as on the artboard. */
const COLLAPSE_AFTER = 2;

export function BoardColumn({ board, column }: { board: BoardResponse; column: Column }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = column.status === "done" && column.cards.length > COLLAPSE_AFTER + 1;
  const shown = collapsible && !expanded ? column.cards.slice(0, COLLAPSE_AFTER) : column.cards;
  const hidden = column.cards.length - shown.length;

  return (
    <section className={`column column--${column.status}`} aria-label={column.label}>
      <h3 className="column__head">
        {column.label} · {column.cards.length}
      </h3>
      {column.cards.length === 0 && <p className="column__empty">Nothing here</p>}
      {shown.map((c) => (
        <CardTile key={c.id} board={board} card={c} />
      ))}
      {collapsible && (
        <button type="button" className="column__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `+${hidden} more`}
        </button>
      )}
    </section>
  );
}
