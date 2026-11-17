import type { BoardResponse, Card } from "@workbench/shared";
import { Avatar } from "./Avatar.tsx";
import { batchMarker, tileAction, type BatchChoice } from "./batch.ts";
import { cardAvatars, cardNotes, cardPill, cardTone } from "./cardView.ts";
import { ModePill } from "./ModePill.tsx";
import { cardHref } from "../route.ts";
import { cardRef } from "./teammates.ts";

/** A Ready card while cards are being selected for a batch: whether it can be selected, and whether it is. */
export interface TilePick {
  choice: BatchChoice;
  checked: boolean;
  onToggle: () => void;
}

/**
 * A card on the board. Its title links to the card and covers the tile; while
 * selecting, a card that can be selected is a label for its checkbox instead,
 * so a click anywhere on it selects it rather than opening the card.
 */
export function CardTile({ board, card, pick }: { board: BoardResponse; card: Card; pick?: TilePick | undefined }) {
  const avatars = cardAvatars(card, board);
  const pill = cardPill(card, board);
  const batch = batchMarker(card, board);
  const toggles = tileAction(pick) === "toggle";
  const Tile = toggles ? "label" : "article";
  const className = `card card--${cardTone(card, board)}${toggles ? " card--pickable" : ""}${pick?.checked ? " is-selected" : ""}`;
  return (
    <Tile className={className} aria-label={toggles ? undefined : card.title}>
      <span className="card__top">
        <span className="card__meta" title={card.id}>
          {cardRef(card.id)} · {card.function_id}
        </span>
        {toggles && pick && (
          <input
            type="checkbox"
            className="card__tick"
            checked={pick.checked}
            onChange={pick.onToggle}
            aria-label={`Select ${cardRef(card.id)}, ${card.title}, for the batch`}
          />
        )}
      </span>
      {toggles ? (
        <span className="card__title">{card.title}</span>
      ) : (
        <a className="card__title card__link" href={cardHref(card.id)}>
          {card.title}
        </a>
      )}
      {(avatars.length > 0 || pill) && (
        <span className="card__people">
          {avatars.map((id) => (
            <Avatar key={id} board={board} id={id} />
          ))}
          {pill && <ModePill mode={pill} />}
        </span>
      )}
      {batch && <span className="pill pill--delegate">{batch}</span>}
      {cardNotes(card, board).map((n) => (
        <span key={n.text} className={`card__note tone--${n.tone}${n.strong ? " is-strong" : ""}`}>
          {n.text}
        </span>
      ))}
      {pick && !pick.choice.selectable && <span className="card__note tone--muted">{pick.choice.reason}</span>}
    </Tile>
  );
}
