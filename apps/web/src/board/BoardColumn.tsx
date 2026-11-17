import { useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { batchChoice } from "./batch.ts";
import { CardTile } from "./CardTile.tsx";
import type { Column } from "./columns.ts";

/** Done collapses to its first cards and a "+N more" toggle, as on the artboard. */
const COLLAPSE_AFTER = 2;

/** Selecting Ready cards for a batch: the board holds the state, the Ready column shows it. */
export interface BatchSelection {
  selecting: boolean;
  selected: readonly string[];
  onToggleSelecting: () => void;
  onToggle: (cardId: string) => void;
}

export function BoardColumn({ board, column, selection }: { board: BoardResponse; column: Column; selection?: BatchSelection | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = column.status === "done" && column.cards.length > COLLAPSE_AFTER + 1;
  const shown = collapsible && !expanded ? column.cards.slice(0, COLLAPSE_AFTER) : column.cards;
  const hidden = column.cards.length - shown.length;
  // Only the Ready column hands cards to the AI, and only when it has two to hand or is already selecting.
  const batching = column.status === "ready" ? selection : undefined;
  const offerSelect = batching !== undefined && (batching.selecting || column.cards.length >= 2);

  return (
    <section className={`column column--${column.status}`} aria-label={column.label}>
      <div className="column__top">
        <h3 className="column__head">
          {column.label} · {column.cards.length}
        </h3>
        {offerSelect && (
          <button type="button" className="column__select" aria-pressed={batching.selecting} aria-label="Select Ready cards for a batch" onClick={batching.onToggleSelecting}>
            Select
          </button>
        )}
      </div>
      {column.cards.length === 0 && <p className="column__empty">Nothing here</p>}
      {shown.map((c) => (
        <CardTile
          key={c.id}
          board={board}
          card={c}
          pick={
            batching?.selecting
              ? { choice: batchChoice(c, board), checked: batching.selected.includes(c.id), onToggle: () => batching.onToggle(c.id) }
              : undefined
          }
        />
      ))}
      {collapsible && (
        <button type="button" className="column__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `+${hidden} more`}
        </button>
      )}
    </section>
  );
}
