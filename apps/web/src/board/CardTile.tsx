import type { BoardResponse, Card } from "@workbench/shared";
import { Avatar } from "./Avatar.tsx";
import { cardAvatars, cardNotes, cardPill, cardTone } from "./cardView.ts";
import { ModePill } from "./ModePill.tsx";
import { cardRef } from "./teammates.ts";

export function CardTile({ board, card }: { board: BoardResponse; card: Card }) {
  const avatars = cardAvatars(card, board);
  const pill = cardPill(card, board);
  return (
    <article className={`card card--${cardTone(card, board)}`} aria-label={card.title}>
      <span className="card__meta" title={card.id}>
        {cardRef(card.id)} · {card.function_id}
      </span>
      <span className="card__title">{card.title}</span>
      {(avatars.length > 0 || pill) && (
        <span className="card__people">
          {avatars.map((id) => (
            <Avatar key={id} board={board} id={id} />
          ))}
          {pill && <ModePill mode={pill} />}
        </span>
      )}
      {cardNotes(card, board).map((n) => (
        <span key={n.text} className={`card__note tone--${n.tone}${n.strong ? " is-strong" : ""}`}>
          {n.text}
        </span>
      ))}
    </article>
  );
}
