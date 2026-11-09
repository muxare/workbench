import type { BoardResponse, Teammate } from "@workbench/shared";
import { teammateHref } from "../route.ts";
import { Avatar } from "./Avatar.tsx";
import { teammateNotes } from "./cardView.ts";
import { modeCountLabel } from "./modes.ts";
import { modeCounts, panelSubline, panelTitle } from "./teammates.ts";

export function TeammatePanel({ board, teammate }: { board: BoardResponse; teammate: Teammate }) {
  const ai = teammate.kind === "ai";
  const sub = panelSubline(teammate);
  return (
    <article className={`teammate${ai ? " teammate--ai" : ""}`} aria-label={teammate.name}>
      <Avatar board={board} id={teammate.id} size={ai ? "lg" : "md"} />
      <div className="teammate__body">
        <b className="teammate__name" title={teammate.name}>
          {ai ? (
            panelTitle(teammate)
          ) : (
            <a className="teammate__link" href={teammateHref(teammate.id)}>
              {panelTitle(teammate)}
            </a>
          )}
        </b>
        {sub !== undefined ? (
          <span className="teammate__sub">{sub}</span>
        ) : (
          <span className="teammate__modes mono">
            {modeCounts(teammate).map((m, i) => (
              <span key={m.mode}>
                {i > 0 && " · "}
                <span className={`mode-text--${m.mode}`}>
                  {m.count} {modeCountLabel[m.mode]}
                </span>
              </span>
            ))}
          </span>
        )}
        {teammateNotes(teammate.id, board).map((n) => (
          <span key={n.text} className={`teammate__note tone--${n.tone}`}>
            {n.text}
          </span>
        ))}
      </div>
    </article>
  );
}
