import type { Link } from "./links.ts";

export type Side = "top" | "left" | "right" | "bottom";

/**
 * The lines between one teammate's panel and the board. Each link is a short
 * line in its kind's style (solid works on, dashed needs input, dotted
 * reports back) with its label; the stylesheet puts the arrowhead at the
 * board or at the teammate according to `data-arrow` and the side.
 */
export function Connector({ links, side }: { links: Link[]; side: Side }) {
  if (links.length === 0) return <div className={`connector connector--${side} connector--empty`} aria-hidden="true" />;
  return (
    <ul className={`connector connector--${side}`} aria-label="Links to the board">
      {links.map((l) => (
        <li key={`${l.kind}-${l.arrow}-${l.cardIds.join()}`} className={`link link--${l.kind}`} data-arrow={l.arrow}>
          <span className="link__line" aria-hidden="true" />
          <span className="link__label">{l.label}</span>
        </li>
      ))}
    </ul>
  );
}
